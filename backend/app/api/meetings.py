from __future__ import annotations

import json
import uuid
from typing import List, Literal, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field

from ..core.config import settings
from ..core.db import get_db, meeting_from_row, new_id, now_iso
from ..core.llm import AIError, transcribe, transcription_prompt
from ..core.security import get_current_user, require_editor
from ..services import exporter, meeting_ai, transcripts
from ..services.scoring_engine import detect_gaps, score_meeting
from .common import MEETING_STATUSES, ai_error_response, get_meeting, get_tenant_settings, update_meeting

router = APIRouter(prefix="/meetings", tags=["meetings"])


class Participant(BaseModel):
    name: str
    role: str = ""
    email: str = ""
    institution: str = ""
    present: bool = True


class AgendaTopic(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    description: str = ""
    order: int = 0
    status: Literal["pending", "in_progress", "completed"] = "pending"
    transcription: str = ""
    summary: str = ""
    deliberation: str = ""
    encaminhamento: str = ""
    responsible: str = ""
    deadline: str = ""


class MeetingCreate(BaseModel):
    title: str
    meeting_type: str = "Reunião Ordinária"
    date: str
    start_time: str = ""
    end_time: str = ""
    location: str = ""
    responsible: str = ""
    secretary: str = ""
    president: str = ""
    participants: List[Participant] = []
    agenda: List[AgendaTopic] = []


class MeetingUpdate(BaseModel):
    title: Optional[str] = None
    meeting_type: Optional[str] = None
    date: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    location: Optional[str] = None
    responsible: Optional[str] = None
    secretary: Optional[str] = None
    president: Optional[str] = None
    participants: Optional[List[Participant]] = None
    agenda: Optional[List[AgendaTopic]] = None
    status: Optional[str] = None
    ata_content: Optional[str] = None
    executive_summary: Optional[str] = None
    next_agenda: Optional[str] = None


@router.post("")
def create_meeting(payload: MeetingCreate, user: dict = Depends(require_editor)):
    tid = user["tenant_id"]
    meeting_id = new_id()
    with get_db() as conn:
        number = conn.execute("SELECT COALESCE(MAX(number), 0) + 1 FROM meetings WHERE tenant_id = ?",
                              (tid,)).fetchone()[0]
        conn.execute(
            """INSERT INTO meetings (id, tenant_id, created_by, number, title, meeting_type, date, start_time,
               end_time, location, responsible, secretary, president, participants_json, agenda_json,
               created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (meeting_id, tid, user["id"], number, payload.title, payload.meeting_type, payload.date,
             payload.start_time, payload.end_time, payload.location, payload.responsible, payload.secretary,
             payload.president, json.dumps([p.model_dump() for p in payload.participants], ensure_ascii=False),
             json.dumps([a.model_dump() for a in payload.agenda], ensure_ascii=False), now_iso(), now_iso()),
        )
    return get_meeting(tid, meeting_id)


@router.get("")
def list_meetings(status: Optional[str] = None, search: Optional[str] = None,
                  user: dict = Depends(get_current_user)):
    query = "SELECT * FROM meetings WHERE tenant_id = ?"
    params: list = [user["tenant_id"]]
    if status:
        query += " AND status = ?"
        params.append(status)
    if search:
        query += " AND (title LIKE ? OR meeting_type LIKE ? OR location LIKE ?)"
        like = f"%{search}%"
        params += [like, like, like]
    query += " ORDER BY date DESC, number DESC LIMIT 500"
    with get_db() as conn:
        rows = conn.execute(query, params).fetchall()
    return [meeting_from_row(r) for r in rows]


@router.get("/{meeting_id}")
def read_meeting(meeting_id: str, user: dict = Depends(get_current_user)):
    return get_meeting(user["tenant_id"], meeting_id)


@router.patch("/{meeting_id}")
def patch_meeting(meeting_id: str, payload: MeetingUpdate, user: dict = Depends(require_editor)):
    fields = payload.model_dump(exclude_none=True)
    if "status" in fields and fields["status"] not in MEETING_STATUSES:
        raise HTTPException(status_code=400, detail="Status inválido")
    return update_meeting(user["tenant_id"], meeting_id, fields)


@router.delete("/{meeting_id}")
def delete_meeting(meeting_id: str, user: dict = Depends(require_editor)):
    get_meeting(user["tenant_id"], meeting_id)
    with get_db() as conn:
        conn.execute("DELETE FROM meetings WHERE id = ? AND tenant_id = ?", (meeting_id, user["tenant_id"]))
    return {"ok": True}


@router.post("/{meeting_id}/start")
def start_meeting(meeting_id: str, user: dict = Depends(require_editor)):
    return update_meeting(user["tenant_id"], meeting_id, {"status": "in_progress"})


# ── Transcrição e IA ──────────────────────────────────────────────────────────

def _topic(meeting: dict, topic_id: str) -> dict:
    topic = next((t for t in meeting.get("agenda", []) if t.get("id") == topic_id), None)
    if not topic:
        raise HTTPException(status_code=404, detail="Item de pauta não encontrado")
    return topic


@router.post("/{meeting_id}/topics/{topic_id}/transcribe")
async def transcribe_topic(meeting_id: str, topic_id: str, file: UploadFile = File(...),
                           chunk_id: Optional[str] = Form(None), seq: int = Form(0),
                           duration_ms: int = Form(0), user: dict = Depends(require_editor)):
    """Recebe um trecho de áudio e ACRESCENTA a transcrição ao item de pauta.

    O navegador grava em trechos de ~45 s e manda um `chunk_id` único por trecho. Reenviar
    o mesmo trecho (falha de rede) devolve o texto já transcrito, sem cobrar nem duplicar.
    """
    tid = user["tenant_id"]
    meeting = get_meeting(tid, meeting_id)
    topic = _topic(meeting, topic_id)
    if chunk_id is not None and not (1 <= len(chunk_id) <= 64):
        raise HTTPException(status_code=400, detail="Identificador de trecho inválido")
    if chunk_id:
        done = transcripts.existing_segment(tid, meeting_id, chunk_id)
        if done:
            return {"text": done["text"], "duplicate": True}
    audio = await file.read()
    if not audio:
        raise HTTPException(status_code=400, detail="Áudio vazio")
    if len(audio) > settings.MAX_AUDIO_MB * 1024 * 1024:
        raise HTTPException(status_code=400, detail=f"Trecho de áudio excede {settings.MAX_AUDIO_MB} MB")
    try:
        raw = transcribe(audio, file.filename or "audio.webm", tenant_id=tid,
                         prompt=transcription_prompt(topic.get("transcription", "")),
                         audio_seconds=max(duration_ms, 0) / 1000)
    except AIError as exc:
        raise ai_error_response(exc)
    text = transcripts.clean_transcription(raw)

    segment = {"id": chunk_id, "topic_id": topic_id, "seq": seq, "duration_ms": duration_ms,
               "text": text} if chunk_id else None
    if not transcripts.append_to_topics(tid, meeting_id, {topic_id: text}, segment=segment):
        done = transcripts.existing_segment(tid, meeting_id, chunk_id)  # envio simultâneo do mesmo trecho
        return {"text": done["text"] if done else text, "duplicate": True}
    return {"text": text, "duplicate": False}


class TopicNote(BaseModel):
    text: str = Field(min_length=1, max_length=20000)


@router.post("/{meeting_id}/topics/{topic_id}/note")
def add_topic_note(meeting_id: str, topic_id: str, payload: TopicNote, user: dict = Depends(require_editor)):
    """Acrescenta uma anotação manual sem sobrescrever trechos que chegam ao mesmo tempo."""
    tid = user["tenant_id"]
    _topic(get_meeting(tid, meeting_id), topic_id)
    transcripts.append_to_topics(tid, meeting_id, {topic_id: f"\n\n[Nota manual]: {payload.text.strip()}"})
    return _topic(get_meeting(tid, meeting_id), topic_id)


# ── Gravação pronta (Zoom/Meet/Teams, gravador) ───────────────────────────────

RECORDING_EXTENSIONS = {"mp3", "m4a", "mp4", "wav", "webm", "ogg", "oga", "opus", "aac", "flac", "mov", "mkv",
                        "wma", "amr", "3gp"}


@router.post("/{meeting_id}/recordings")
async def upload_recording(meeting_id: str, background: BackgroundTasks, file: UploadFile = File(...),
                           topic_id: Optional[str] = Form(None), user: dict = Depends(require_editor)):
    """Recebe a gravação da reunião inteira (ou de um item) e transcreve em segundo plano.

    Sem `topic_id`, a IA identifica onde começa cada item da pauta e reparte o texto.
    """
    tid = user["tenant_id"]
    meeting = get_meeting(tid, meeting_id)
    if topic_id:
        _topic(meeting, topic_id)
    if not meeting.get("agenda"):
        raise HTTPException(status_code=400, detail="Cadastre a pauta antes de enviar a gravação")
    ext = (file.filename or "").rsplit(".", 1)[-1].lower()
    if ext not in RECORDING_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Formato não suportado. Envie áudio ou vídeo (mp3, m4a, mp4, wav…)")

    job_id = new_id()
    folder = settings.UPLOAD_DIR / "recordings" / str(tid)
    folder.mkdir(parents=True, exist_ok=True)
    dest = folder / f"{job_id}.{ext}"
    limit, size = settings.MAX_RECORDING_MB * 1024 * 1024, 0
    try:
        with open(dest, "wb") as out:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > limit:
                    raise HTTPException(status_code=400,
                                        detail=f"Arquivo excede {settings.MAX_RECORDING_MB} MB")
                out.write(chunk)
    except BaseException:
        dest.unlink(missing_ok=True)
        raise
    if size == 0:
        dest.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="Arquivo vazio")

    with get_db() as conn:
        conn.execute(
            """INSERT INTO jobs (id, tenant_id, meeting_id, kind, status, step, result_json, created_at, updated_at)
               VALUES (?,?,?,?,?,?,?,?,?)""",
            (job_id, tid, meeting_id, "recording", "queued", "Na fila",
             json.dumps({"filename": file.filename, "topic_id": topic_id}, ensure_ascii=False), now_iso(), now_iso()),
        )
    background.add_task(transcripts.process_recording, job_id, tid, meeting_id, str(dest), topic_id,
                        meeting["agenda"])
    return _job(tid, meeting_id, job_id)


def _job(tenant_id: int, meeting_id: str, job_id: str) -> dict:
    with get_db() as conn:
        row = conn.execute("SELECT * FROM jobs WHERE id = ? AND tenant_id = ? AND meeting_id = ?",
                           (job_id, tenant_id, meeting_id)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Processamento não encontrado")
    return transcripts.job_public(row)


@router.get("/{meeting_id}/jobs")
def list_jobs(meeting_id: str, user: dict = Depends(get_current_user)):
    get_meeting(user["tenant_id"], meeting_id)
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM jobs WHERE tenant_id = ? AND meeting_id = ? ORDER BY created_at DESC "
                            "LIMIT 20", (user["tenant_id"], meeting_id)).fetchall()
    return [transcripts.job_public(r) for r in rows]


@router.get("/{meeting_id}/jobs/{job_id}")
def read_job(meeting_id: str, job_id: str, user: dict = Depends(get_current_user)):
    return _job(user["tenant_id"], meeting_id, job_id)


@router.post("/{meeting_id}/topics/{topic_id}/finalize")
def finalize_topic(meeting_id: str, topic_id: str, user: dict = Depends(require_editor)):
    tid = user["tenant_id"]
    meeting = get_meeting(tid, meeting_id)
    topic = _topic(meeting, topic_id)
    try:
        data = meeting_ai.summarize_topic(topic, tenant_id=tid)
    except AIError as exc:
        raise ai_error_response(exc)

    for t in meeting["agenda"]:
        if t.get("id") == topic_id:
            t.update(summary=data["discussao"], deliberation=data["deliberacao"],
                     encaminhamento=data["encaminhamento"], responsible=data["responsavel"],
                     deadline=data["prazo"], status="completed")
    update_meeting(tid, meeting_id, {"agenda": meeting["agenda"]})

    with get_db() as conn:  # mantém no máximo uma deliberação por item
        conn.execute("DELETE FROM deliberations WHERE tenant_id = ? AND meeting_id = ? AND topic_id = ?",
                     (tid, meeting_id, topic_id))
        if meeting_ai.has_deliberation(data["deliberacao"]):
            conn.execute(
                """INSERT INTO deliberations (id, tenant_id, meeting_id, meeting_number, topic_id, topic_title,
                   decision, responsible, deadline, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                (new_id(), tid, meeting_id, meeting["number"], topic_id, topic.get("title", ""),
                 data["deliberacao"], data["responsavel"], data["prazo"], "aberto", now_iso()),
            )
    return data


@router.post("/{meeting_id}/generate-ata")
def generate_ata(meeting_id: str, user: dict = Depends(require_editor)):
    tid = user["tenant_id"]
    meeting = get_meeting(tid, meeting_id)
    tenant_settings, profile, _ = get_tenant_settings(tid)
    institution = tenant_settings.get("institution_name") or user.get("institution", "")
    try:
        data = meeting_ai.generate_ata(meeting, profile=profile, institution=institution,
                                       tenant_settings=tenant_settings, tenant_id=tid)
    except AIError as exc:
        raise ai_error_response(exc)
    update_meeting(tid, meeting_id, {
        "ata_content": data["ata_completa"], "executive_summary": data["resumo_executivo"],
        "next_agenda": data["proxima_pauta_sugerida"], "status": "completed",
    })
    return data


@router.get("/{meeting_id}/quality")
def meeting_quality(meeting_id: str, user: dict = Depends(get_current_user)):
    meeting = get_meeting(user["tenant_id"], meeting_id)
    return {"scores": score_meeting(meeting), "gaps": detect_gaps(meeting)}


# ── Exportação ────────────────────────────────────────────────────────────────

def _model_docx_bytes(tenant_id: int, model_doc_id: str | None) -> bytes | None:
    if not model_doc_id:
        return None
    with get_db() as conn:
        row = conn.execute("SELECT file_path, filetype FROM knowledge_docs WHERE id = ? AND tenant_id = ?",
                           (model_doc_id, tenant_id)).fetchone()
    if not row or row["filetype"] != "docx" or not row["file_path"]:
        return None
    try:
        with open(row["file_path"], "rb") as fh:
            return fh.read()
    except OSError:
        return None


@router.get("/{meeting_id}/export/docx")
def export_docx(meeting_id: str, user: dict = Depends(get_current_user)):
    tid = user["tenant_id"]
    meeting = get_meeting(tid, meeting_id)
    _, profile, model_doc_id = get_tenant_settings(tid)
    content = exporter.build_docx(meeting, model_docx=_model_docx_bytes(tid, model_doc_id), profile=profile)
    return Response(content, media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                    headers={"Content-Disposition": f'attachment; filename="ata_{meeting["number"]}.docx"'})


@router.get("/{meeting_id}/export/pdf")
def export_pdf(meeting_id: str, user: dict = Depends(get_current_user)):
    tid = user["tenant_id"]
    meeting = get_meeting(tid, meeting_id)
    tenant_settings, _, _ = get_tenant_settings(tid)
    content = exporter.build_pdf(meeting, institution=tenant_settings.get("institution_name") or user.get("institution", ""))
    return Response(content, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="ata_{meeting["number"]}.pdf"'})
