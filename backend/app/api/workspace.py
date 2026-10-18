"""Deliberações, painel, modelos de pauta, agente revisor e dados econômicos."""
from __future__ import annotations

from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..core.db import get_db, now_iso
from ..core.llm import AIError
from ..core.security import get_current_user, require_editor
from ..services import agent as agent_svc
from ..services.economic_data import (generate_scenario_analysis, get_economic_indicators, get_ipca_history,
                                      get_selic_history)
from .common import ai_error_response, get_meeting, get_tenant_settings, update_meeting

router = APIRouter(tags=["workspace"])

# ── Deliberações ──────────────────────────────────────────────────────────────

DELIB_STATUSES = ("aberto", "em_andamento", "concluido", "cancelado")


class DeliberationUpdate(BaseModel):
    status: Optional[Literal["aberto", "em_andamento", "concluido", "cancelado"]] = None
    responsible: Optional[str] = None
    deadline: Optional[str] = None
    decision: Optional[str] = None


@router.get("/deliberations")
def list_deliberations(status: Optional[str] = None, user: dict = Depends(get_current_user)):
    query, params = "SELECT * FROM deliberations WHERE tenant_id = ?", [user["tenant_id"]]
    if status:
        query += " AND status = ?"
        params.append(status)
    with get_db() as conn:
        rows = conn.execute(query + " ORDER BY created_at DESC LIMIT 500", params).fetchall()
    return [dict(r) for r in rows]


@router.patch("/deliberations/{deliberation_id}")
def update_deliberation(deliberation_id: str, payload: DeliberationUpdate, user: dict = Depends(require_editor)):
    fields = payload.model_dump(exclude_none=True)
    if not fields:
        raise HTTPException(status_code=400, detail="Nada para atualizar")
    sets = ", ".join(f"{k} = ?" for k in fields)
    with get_db() as conn:
        cur = conn.execute(f"UPDATE deliberations SET {sets} WHERE id = ? AND tenant_id = ?",
                           (*fields.values(), deliberation_id, user["tenant_id"]))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Deliberação não encontrada")
        row = conn.execute("SELECT * FROM deliberations WHERE id = ?", (deliberation_id,)).fetchone()
    return dict(row)


# ── Painel ────────────────────────────────────────────────────────────────────

@router.get("/dashboard/stats")
def dashboard_stats(user: dict = Depends(get_current_user)):
    tid = user["tenant_id"]
    with get_db() as conn:
        counts = {r["status"]: r["n"] for r in conn.execute(
            "SELECT status, COUNT(*) AS n FROM meetings WHERE tenant_id = ? GROUP BY status", (tid,))}
        pending = conn.execute(
            "SELECT COUNT(*) FROM deliberations WHERE tenant_id = ? AND status IN ('aberto','em_andamento')",
            (tid,)).fetchone()[0]
    return {
        "total_meetings": sum(counts.values()),
        "completed_meetings": counts.get("completed", 0),
        "in_progress_meetings": counts.get("in_progress", 0),
        "upcoming_meetings": counts.get("scheduled", 0),
        "pending_deliberations": pending,
    }


# ── Modelos de pauta ──────────────────────────────────────────────────────────

TEMPLATES = [
    {"id": "comite_ordinaria", "name": "Comitê de Investimentos — Ordinária", "agenda": [
        {"title": "Abertura e verificação de quórum"},
        {"title": "Leitura e aprovação da ata anterior"},
        {"title": "Cenário econômico e de mercado"},
        {"title": "Análise da carteira e rentabilidade do mês"},
        {"title": "Enquadramento da carteira (Resolução CMN e Política de Investimentos)"},
        {"title": "Propostas de aplicações e resgates"},
        {"title": "Assuntos gerais"},
        {"title": "Encerramento"},
    ]},
    {"id": "comite_extraordinaria", "name": "Comitê de Investimentos — Extraordinária", "agenda": [
        {"title": "Abertura e verificação de quórum"},
        {"title": "Assunto da convocação"},
        {"title": "Deliberação"},
        {"title": "Encerramento"},
    ]},
    {"id": "conselho_deliberativo", "name": "Conselho Deliberativo", "agenda": [
        {"title": "Verificação de quórum"},
        {"title": "Leitura e aprovação da ata anterior"},
        {"title": "Relatório da Diretoria Executiva"},
        {"title": "Deliberações"},
        {"title": "Encerramento"},
    ]},
    {"id": "conselho_fiscal", "name": "Conselho Fiscal", "agenda": [
        {"title": "Verificação de quórum"},
        {"title": "Análise dos demonstrativos e balancetes"},
        {"title": "Parecer"},
        {"title": "Encerramento"},
    ]},
    {"id": "diretoria", "name": "Diretoria Executiva", "agenda": [
        {"title": "Aprovação da ata anterior"},
        {"title": "Apresentação de resultados"},
        {"title": "Planejamento de ações"},
        {"title": "Assuntos gerais"},
    ]},
]


@router.get("/templates")
def list_templates(user: dict = Depends(get_current_user)):
    return TEMPLATES


# ── Agente revisor ────────────────────────────────────────────────────────────

class AgentFeedback(BaseModel):
    change_id: str
    accepted: bool
    note: str = ""


@router.post("/meetings/{meeting_id}/agent/run")
def agent_run(meeting_id: str, user: dict = Depends(require_editor)):
    tid = user["tenant_id"]
    meeting = get_meeting(tid, meeting_id)
    tenant_settings, profile, _ = get_tenant_settings(tid)
    institution = tenant_settings.get("institution_name") or user.get("institution", "")
    try:
        result = agent_svc.run_agent(meeting, profile=profile, institution=institution, tenant_id=tid)
    except AIError as exc:
        raise ai_error_response(exc)
    with get_db() as conn:
        conn.execute("DELETE FROM agent_changes WHERE tenant_id = ? AND meeting_id = ? AND status = 'pending'",
                     (tid, meeting_id))
        for ch in result["changes"]:
            conn.execute(
                """INSERT INTO agent_changes (id, tenant_id, meeting_id, field, section, original, proposed,
                   rationale, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)""",
                (ch["id"], tid, meeting_id, ch["field"], ch["section"], ch["original"], ch["proposed"],
                 ch["rationale"], "pending", ch["created_at"]),
            )
    result.pop("changes", None)
    return result


@router.get("/meetings/{meeting_id}/agent/changes")
def agent_changes(meeting_id: str, user: dict = Depends(get_current_user)):
    get_meeting(user["tenant_id"], meeting_id)
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM agent_changes WHERE tenant_id = ? AND meeting_id = ? ORDER BY created_at",
                            (user["tenant_id"], meeting_id)).fetchall()
    return [dict(r) for r in rows]


@router.get("/meetings/{meeting_id}/agent/pending")
def agent_pending(meeting_id: str, user: dict = Depends(get_current_user)):
    return [c for c in agent_changes(meeting_id, user) if c["status"] == "pending"]


@router.post("/meetings/{meeting_id}/agent/feedback")
def agent_feedback(meeting_id: str, payload: AgentFeedback, user: dict = Depends(require_editor)):
    tid = user["tenant_id"]
    with get_db() as conn:
        change = conn.execute("SELECT * FROM agent_changes WHERE id = ? AND meeting_id = ? AND tenant_id = ?",
                              (payload.change_id, meeting_id, tid)).fetchone()
    if not change:
        raise HTTPException(status_code=404, detail="Alteração não encontrada")
    if change["status"] != "pending":
        raise HTTPException(status_code=409, detail="Esta sugestão já foi respondida")
    status = "accepted" if payload.accepted else "rejected"
    if payload.accepted:
        meeting = agent_svc.apply_change(get_meeting(tid, meeting_id), dict(change))
        update_meeting(tid, meeting_id, {"ata_content": meeting.get("ata_content", ""), "agenda": meeting["agenda"]})
    with get_db() as conn:
        conn.execute("UPDATE agent_changes SET status = ?, user_note = ?, feedback_at = ? WHERE id = ?",
                     (status, payload.note, now_iso(), payload.change_id))
    return {"ok": True, "status": status}


@router.get("/agent/profile")
def agent_profile(user: dict = Depends(get_current_user)):
    tid = user["tenant_id"]
    with get_db() as conn:
        counts = {r["status"]: r["n"] for r in conn.execute(
            "SELECT status, COUNT(*) AS n FROM agent_changes WHERE tenant_id = ? GROUP BY status", (tid,))}
        kb_count = conn.execute("SELECT COUNT(*) FROM knowledge_docs WHERE tenant_id = ?", (tid,)).fetchone()[0]
    accepted, rejected = counts.get("accepted", 0), counts.get("rejected", 0)
    total = accepted + rejected
    _, profile, model_doc_id = get_tenant_settings(tid)
    return {
        "total_feedbacks": total,
        "accepted_changes": accepted,
        "rejected_changes": rejected,
        "acceptance_rate": round(accepted / total * 100) if total else 0,
        "kb_documents": kb_count,
        "has_model": bool(model_doc_id),
        "maturity": "alta" if total > 50 else ("média" if total > 10 else "baixa"),
        "learning_active": bool(model_doc_id) or kb_count > 0 or total > 0,
    }


# ── Dados econômicos (Banco Central) ──────────────────────────────────────────

@router.get("/economicos")
async def economic_data(user: dict = Depends(get_current_user)):
    indicators = await get_economic_indicators()
    selic = (indicators.get("selic") or {}).get("value")
    ipca = (indicators.get("ipca") or {}).get("value")
    return {**indicators, "scenario": generate_scenario_analysis(selic, ipca)}


@router.get("/economicos/historico/selic")
async def selic_history(months: int = 12, user: dict = Depends(get_current_user)):
    return await get_selic_history(max(1, min(months, 60)))


@router.get("/economicos/historico/ipca")
async def ipca_history(months: int = 12, user: dict = Depends(get_current_user)):
    return await get_ipca_history(max(1, min(months, 60)))
