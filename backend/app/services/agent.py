"""Agente revisor da ata (portado do ATA, que por sua vez veio do AGL).

Propõe reescritas por seção; nada é aplicado sem o aceite do usuário.
"""
from __future__ import annotations

import logging
import uuid

from ..core.db import now_iso
from ..core.llm import AIError, chat_json
from .model_profile import profile_prompt_block
from .scoring_engine import detect_gaps, score_meeting

logger = logging.getLogger(__name__)

_SYSTEM = (
    "Você é especialista em redação de atas de comitês de investimentos de RPPS brasileiros. "
    "Melhora forma e clareza sem alterar fatos, nomes, números, votos ou decisões. Retorne sempre JSON válido."
)

REWRITABLE_TOPIC_FIELDS = (("summary", "Resumo/Discussão"), ("deliberation", "Deliberação"),
                           ("encaminhamento", "Encaminhamento"))


def _rewrite(section: str, original: str, style: str, tenant_id: int) -> dict | None:
    prompt = f"""Estilo e modelo do RPPS:
{style}

Reescreva o trecho da seção "{section}" tornando-o mais formal e preciso (3ª pessoa), claro e alinhado ao
modelo. Não acrescente nem remova fatos.

Texto original:
\"\"\"{original[:6000]}\"\"\"

Retorne JSON: {{"improved": "texto reescrito", "rationale": "melhorias aplicadas (até 60 palavras)"}}"""
    try:
        data = chat_json(_SYSTEM, prompt, tenant_id=tenant_id, operation="agent_rewrite")
    except AIError:
        logger.warning("Agente: falha ao reescrever %s", section)
        return None
    improved = str(data.get("improved", "")).strip()
    if not improved or improved == original.strip():
        return None
    return {"improved": improved, "rationale": str(data.get("rationale", ""))}


def run_agent(meeting: dict, *, profile: dict, institution: str, tenant_id: int) -> dict:
    style = profile_prompt_block(profile, institution)
    scores_before = score_meeting(meeting)
    changes: list[dict] = []

    def add(field: str, section: str, original: str, result: dict | None) -> None:
        if result:
            changes.append({
                "id": str(uuid.uuid4()), "field": field, "section": section,
                "original": original, "proposed": result["improved"],
                "rationale": result["rationale"], "status": "pending", "created_at": now_iso(),
            })

    ata = (meeting.get("ata_content") or "").strip()
    if ata:
        add("ata_content", "Texto Principal da Ata", ata, _rewrite("Texto Principal da Ata", ata, style, tenant_id))

    for topic in meeting.get("agenda", []):
        for field, label in REWRITABLE_TOPIC_FIELDS:
            text = (topic.get(field) or "").strip()
            if len(text) < 20:
                continue
            section = f"{label} — {topic.get('title', '')}"
            add(f"agenda.{topic.get('id')}.{field}", section, text, _rewrite(section, text, style, tenant_id))

    simulated = apply_changes(dict(meeting, agenda=[dict(t) for t in meeting.get("agenda", [])]), changes)
    scores_after = score_meeting(simulated)
    return {
        "run_id": str(uuid.uuid4()),
        "meeting_id": meeting.get("id"),
        "changes": changes,
        "changes_count": len(changes),
        "gaps": detect_gaps(meeting),
        "scores_before": scores_before,
        "scores_after": scores_after,
        "score_delta": scores_after["overall"] - scores_before["overall"],
        "ran_at": now_iso(),
    }


def apply_changes(meeting: dict, changes: list[dict]) -> dict:
    for change in changes:
        apply_change(meeting, change)
    return meeting


def apply_change(meeting: dict, change: dict) -> dict:
    field, proposed = change.get("field", ""), change.get("proposed", "")
    if field == "ata_content":
        meeting["ata_content"] = proposed
    elif field.startswith("agenda."):
        parts = field.split(".", 2)
        if len(parts) == 3 and parts[2] in {f for f, _ in REWRITABLE_TOPIC_FIELDS}:
            for topic in meeting.get("agenda", []):
                if topic.get("id") == parts[1]:
                    topic[parts[2]] = proposed
                    break
    return meeting
