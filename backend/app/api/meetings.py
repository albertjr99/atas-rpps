from __future__ import annotations

import json
import uuid
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field

from ..core.config import settings
from ..core.db import get_db, meeting_from_row, new_id, now_iso
from ..core.llm import AIError, transcribe
from ..core.security import get_current_user, require_editor
from ..services import exporter, meeting_ai
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
                           user: dict = Depends(require_editor)):
    """Recebe um trecho de áudio e ACRESCENTA a transcrição ao item de pauta.

    Pode ser chamado várias vezes por item (gravação em pedaços — Etapa 1).
    """
    tid = user["tenant_id"]
    meeting = get_meeting(tid, meeting_id)
    _topic(meeting, topic_id)
    audio = await file.read()
    if not audio:
        raise HTTPException(status_code=400, detail="Áudio vazio")
    if len(audio) > settings.MAX_AUDIO_MB * 1024 * 1024:
        raise HTTPException(status_code=400, detail=f"Trecho de áudio excede {settings.MAX_AUDIO_MB} MB")
    try:
        text = transcribe(audio, file.filename or "audio.webm", tenant_id=tid)
    except AIError as exc:
        raise ai_error_response(exc)

    meeting = get_meeting(tid, meeting_id)  # relê para não sobrescrever trechos concorrentes
    for t in meeting["agenda"]:
        if t.get("id") == topic_id:
            t["transcription"] = f"{t.get('transcription', '')} {text}".strip()
            if t.get("status") == "pending":
                t["status"] = "in_progress"
    update_meeting(tid, meeting_id, {"agenda": meeting["agenda"]})
    return {"text": text}


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
