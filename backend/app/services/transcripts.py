"""Transcrição: limpeza do texto, gravação atômica nos itens da pauta e gravações prontas.

- Trechos gravados no navegador chegam com um id gerado no cliente; reenviar o mesmo
  trecho (rede instável) não transcreve nem acrescenta o texto de novo.
- Gravações prontas (Zoom/Meet/Teams, gravador) são divididas com ffmpeg em partes
  que cabem no limite da API de transcrição e processadas em segundo plano.
"""
from __future__ import annotations

import json
import logging
import re
import shutil
import subprocess
import tempfile
import unicodedata
from pathlib import Path

from ..core.config import settings
from ..core.db import get_db, now_iso
from ..core.llm import AIError, transcribe, transcription_prompt

logger = logging.getLogger(__name__)

# Frases que o Whisper costuma "inventar" em trechos de silêncio ou ruído (vêm de legendas
# de vídeos usadas no treino). Uma frase que contenha um destes marcadores é descartada.
_HALLUCINATION_MARKERS = (
    "amara.org", "inscreva-se", "inscreva se", "se inscreva", "por assistir", "legendas pela",
    "legendado por", "legenda por", "legendas por", "ative o sininho", "deixe seu like",
    "subtitles by", "transcricao e legendas", "e ai, galera",
)


def _norm(text: str) -> str:
    text = unicodedata.normalize("NFKD", text.lower())
    return "".join(c for c in text if not unicodedata.combining(c))


def split_sentences(text: str) -> list[str]:
    parts = re.split(r"(?<=[.!?…])\s+", (text or "").strip())
    return [p.strip() for p in parts if p.strip()]


def clean_transcription(text: str) -> str:
    """Remove frases típicas de alucinação e espaços extras."""
    kept = [s for s in split_sentences(text) if not any(m in _norm(s) for m in _HALLUCINATION_MARKERS)]
    return re.sub(r"\s+", " ", " ".join(kept)).strip()


def append_to_topics(tenant_id: int, meeting_id: str, texts: dict[str, str],
                     segment: dict | None = None) -> bool:
    """Acrescenta texto a um ou mais itens da pauta numa única transação.

    Se `segment` vier preenchido, registra o trecho e só acrescenta se ele ainda não existia.
    Retorna False quando o trecho já tinha sido registrado (reenvio).
    """
    with get_db() as conn:
        conn.execute("BEGIN IMMEDIATE")
        if segment:
            cur = conn.execute(
                """INSERT OR IGNORE INTO transcript_segments (tenant_id, meeting_id, id, topic_id, seq,
                   duration_ms, text, created_at) VALUES (?,?,?,?,?,?,?,?)""",
                (tenant_id, meeting_id, segment["id"], segment["topic_id"], segment.get("seq", 0),
                 segment.get("duration_ms", 0), segment.get("text", ""), now_iso()),
            )
            if cur.rowcount == 0:
                return False
        row = conn.execute("SELECT agenda_json FROM meetings WHERE id = ? AND tenant_id = ?",
                           (meeting_id, tenant_id)).fetchone()
        if not row:
            return False
        agenda = json.loads(row["agenda_json"] or "[]")
        changed = False
        for topic in agenda:
            extra = (texts.get(topic.get("id")) or "").strip()
            if not extra:
                continue
            topic["transcription"] = f"{topic.get('transcription', '')} {extra}".strip()
            if topic.get("status", "pending") == "pending":
                topic["status"] = "in_progress"
            changed = True
        if changed:
            conn.execute("UPDATE meetings SET agenda_json = ?, updated_at = ? WHERE id = ? AND tenant_id = ?",
                         (json.dumps(agenda, ensure_ascii=False), now_iso(), meeting_id, tenant_id))
        return True


def existing_segment(tenant_id: int, meeting_id: str, segment_id: str) -> dict | None:
    with get_db() as conn:
        row = conn.execute("SELECT * FROM transcript_segments WHERE tenant_id = ? AND meeting_id = ? AND id = ?",
                           (tenant_id, meeting_id, segment_id)).fetchone()
    return dict(row) if row else None


# ── Trabalhos em segundo plano ───────────────────────────────────────────────

def job_public(row) -> dict:
    d = dict(row)
    d["result"] = json.loads(d.pop("result_json") or "{}")
    return d


def update_job(job_id: str, **fields) -> None:
    if "result" in fields:
        fields["result_json"] = json.dumps(fields.pop("result"), ensure_ascii=False)
    fields["updated_at"] = now_iso()
    sets = ", ".join(f"{k} = ?" for k in fields)
    with get_db() as conn:
        conn.execute(f"UPDATE jobs SET {sets} WHERE id = ?", (*fields.values(), job_id))


def probe_duration(path: Path) -> float:
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
            capture_output=True, text=True, timeout=120, check=True,
        ).stdout.strip()
        return float(out)
    except (subprocess.SubprocessError, ValueError, OSError):
        return 0.0


def split_audio(path: Path, out_dir: Path, segment_seconds: int = 600) -> list[Path]:
    """Converte para Opus mono 16 kHz (≈2 MB a cada 10 min) e divide em partes."""
    if not shutil.which("ffmpeg"):
        raise RuntimeError("ffmpeg não está instalado no servidor.")
    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(path), "-vn", "-ac", "1",
           "-ar", "16000", "-c:a", "libopus", "-b:a", "24k", "-f", "segment",
           "-segment_time", str(segment_seconds), "-reset_timestamps", "1", str(out_dir / "parte%03d.ogg")]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=3600)
    parts = sorted(out_dir.glob("parte*.ogg"))
    if result.returncode != 0 or not parts:
        logger.warning("ffmpeg falhou: %s", result.stderr[-500:])
        raise RuntimeError("Não foi possível ler o áudio deste arquivo. Envie um arquivo de áudio ou vídeo válido.")
    return parts


def distribute(sentences: list[str], starts: dict[str, int], first_topic_id: str) -> dict[str, str]:
    """Reparte frases entre itens a partir do índice da frase onde cada item começa.

    Frases anteriores ao primeiro item identificado (abertura) vão para esse primeiro item.
    """
    marks = sorted((idx, tid) for tid, idx in starts.items() if 0 <= idx < len(sentences))
    if not marks:
        return {first_topic_id: " ".join(sentences)}
    texts: dict[str, list[str]] = {}
    for n, (idx, tid) in enumerate(marks):
        begin = 0 if n == 0 else idx
        end = marks[n + 1][0] if n + 1 < len(marks) else len(sentences)
        texts.setdefault(tid, []).extend(sentences[begin:end])
    return {tid: " ".join(parts) for tid, parts in texts.items() if parts}


def process_recording(job_id: str, tenant_id: int, meeting_id: str, file_path: str, topic_id: str | None,
                      agenda: list[dict]) -> None:
    """Transcreve uma gravação pronta e grava o texto nos itens da pauta."""
    from . import meeting_ai  # import tardio: evita ciclo

    src = Path(file_path)
    work = Path(tempfile.mkdtemp(prefix="gravacao-", dir=src.parent))
    try:
        update_job(job_id, status="running", step="Preparando o áudio")
        duration = probe_duration(src)
        if duration and duration > settings.MAX_RECORDING_HOURS * 3600:
            raise RuntimeError(f"A gravação passa de {settings.MAX_RECORDING_HOURS:g} horas.")
        parts = split_audio(src, work)
        src.unlink(missing_ok=True)  # o original não é mais necessário (LGPD)
        update_job(job_id, step="Transcrevendo", total=len(parts))

        texts: list[str] = []
        for i, part in enumerate(parts):
            seconds = probe_duration(part)
            text = transcribe(part.read_bytes(), part.name, tenant_id=tenant_id,
                              prompt=transcription_prompt(texts[-1] if texts else ""), audio_seconds=seconds)
            texts.append(clean_transcription(text))
            part.unlink(missing_ok=True)
            update_job(job_id, progress=i + 1)

        full_text = " ".join(t for t in texts if t).strip()
        if not full_text:
            raise RuntimeError("Não foi identificada fala na gravação.")

        warning = ""
        if topic_id:
            assignment = {topic_id: full_text}
        elif len(agenda) == 1:
            assignment = {agenda[0]["id"]: full_text}
        else:
            update_job(job_id, step="Separando por item da pauta")
            sentences = split_sentences(full_text)
            try:
                starts = meeting_ai.locate_agenda_topics(sentences, agenda, tenant_id=tenant_id)
            except AIError:
                starts = {}
            if not starts:
                warning = ("Não foi possível identificar automaticamente onde começa cada item; "
                           "a transcrição completa foi colocada no primeiro item.")
            assignment = distribute(sentences, starts, agenda[0]["id"])

        append_to_topics(tenant_id, meeting_id, assignment)
        titles = {t["id"]: t.get("title", "") for t in agenda}
        update_job(job_id, status="done", step="Concluído", result={
            "duration_seconds": round(duration), "words": len(full_text.split()), "warning": warning,
            "topics": [{"id": tid, "title": titles.get(tid, ""), "words": len(txt.split())}
                       for tid, txt in assignment.items()],
        })
    except AIError as exc:
        update_job(job_id, status="failed", error=str(exc))
    except Exception as exc:  # noqa: BLE001 — o erro precisa chegar ao usuário pelo status do trabalho
        logger.exception("Falha ao processar gravação")
        update_job(job_id, status="failed", error=str(exc) if isinstance(exc, RuntimeError)
                   else "Erro inesperado ao processar a gravação.")
    finally:
        src.unlink(missing_ok=True)
        shutil.rmtree(work, ignore_errors=True)
