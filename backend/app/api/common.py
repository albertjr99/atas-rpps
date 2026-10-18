"""Acesso a dados sempre filtrado pelo RPPS (tenant) do usuário autenticado."""
from __future__ import annotations

import json

from fastapi import HTTPException

from ..core.db import get_db, meeting_from_row, now_iso

MEETING_SCALAR_FIELDS = (
    "title", "meeting_type", "date", "start_time", "end_time", "location", "responsible",
    "secretary", "president", "status", "ata_content", "executive_summary", "next_agenda",
)
MEETING_STATUSES = ("scheduled", "in_progress", "completed", "cancelled")


def get_meeting(tenant_id: int, meeting_id: str) -> dict:
    with get_db() as conn:
        row = conn.execute("SELECT * FROM meetings WHERE id = ? AND tenant_id = ?",
                           (meeting_id, tenant_id)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Reunião não encontrada")
    return meeting_from_row(row)


def update_meeting(tenant_id: int, meeting_id: str, fields: dict) -> dict:
    sets, values = [], []
    for key, value in fields.items():
        if key == "participants":
            sets.append("participants_json = ?")
            values.append(json.dumps(value, ensure_ascii=False))
        elif key == "agenda":
            sets.append("agenda_json = ?")
            values.append(json.dumps(value, ensure_ascii=False))
        elif key in MEETING_SCALAR_FIELDS:
            sets.append(f"{key} = ?")
            values.append(value)
    sets.append("updated_at = ?")
    values.append(now_iso())
    with get_db() as conn:
        cur = conn.execute(
            f"UPDATE meetings SET {', '.join(sets)} WHERE id = ? AND tenant_id = ?",
            (*values, meeting_id, tenant_id),
        )
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Reunião não encontrada")
    return get_meeting(tenant_id, meeting_id)


def get_tenant_settings(tenant_id: int) -> tuple[dict, dict, str | None]:
    """Retorna (configurações, perfil da ata-modelo, id do documento-modelo)."""
    with get_db() as conn:
        row = conn.execute("SELECT * FROM tenant_settings WHERE tenant_id = ?", (tenant_id,)).fetchone()
    if not row:
        return {}, {}, None
    return json.loads(row["data_json"] or "{}"), json.loads(row["model_profile_json"] or "{}"), row["model_doc_id"]


def ai_error_response(exc: Exception) -> HTTPException:
    return HTTPException(status_code=502, detail=str(exc) or "Falha no serviço de IA")
