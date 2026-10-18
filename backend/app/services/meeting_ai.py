"""IA da reunião: fechamento de tópico e geração da ata completa.

Prompts portados do projeto ATA, agora alimentados pelo perfil da ata-modelo
do RPPS (herança do AGL) e chamando o provedor de IA diretamente.
"""
from __future__ import annotations

from ..core.llm import chat_json
from .model_profile import profile_prompt_block

NO_DELIBERATION = "Sem deliberação registrada."

_TOPIC_SYSTEM = (
    "Você é um assistente especialista em redação de atas de comitês de investimentos de RPPS "
    "(Regime Próprio de Previdência Social) em português do Brasil. Sempre retorna JSON válido. "
    "Nunca invente fatos, nomes, valores ou votos que não estejam na transcrição."
)

_ATA_SYSTEM = (
    "Você redige atas oficiais de comitês de investimentos de RPPS em português do Brasil, com precisão "
    "jurídica, clareza e fidelidade ao modelo da instituição. Nunca invente fatos, nomes, valores ou votos. "
    "Quando um dado necessário não estiver disponível, escreva [PREENCHER: descrição do dado]."
)


def summarize_topic(topic: dict, *, tenant_id: int) -> dict:
    transcription = (topic.get("transcription") or "").strip() or topic.get("summary") or topic.get("title", "")
    prompt = f"""Analise a transcrição do item de pauta "{topic.get('title', '')}" e gere um JSON:
{{
  "discussao": "Resumo objetivo da discussão em 2-4 frases, em português formal.",
  "deliberacao": "Decisão tomada ou consenso, em uma frase clara. Se não houve, escreva '{NO_DELIBERATION}'",
  "encaminhamento": "Ação prática a ser realizada. Se não houver, 'Sem encaminhamento.'",
  "responsavel": "Nome do responsável citado ou 'Não definido'",
  "prazo": "Prazo mencionado (ex. '30/03/2026' ou '30 dias') ou 'Não definido'"
}}

Transcrição:
\"\"\"{transcription[:24000]}\"\"\"

Responda APENAS com o JSON."""
    data = chat_json(_TOPIC_SYSTEM, prompt, tenant_id=tenant_id, operation="topic_summary")
    return {
        "discussao": str(data.get("discussao", "")),
        "deliberacao": str(data.get("deliberacao", "")) or NO_DELIBERATION,
        "encaminhamento": str(data.get("encaminhamento", "")),
        "responsavel": str(data.get("responsavel", "")),
        "prazo": str(data.get("prazo", "")),
    }


def has_deliberation(text: str) -> bool:
    return bool(text) and "sem deliberação" not in text.lower()


def generate_ata(meeting: dict, *, profile: dict, institution: str, tenant_settings: dict,
                 tenant_id: int) -> dict:
    agenda_summary = "\n\n".join(
        f"### {i + 1}. {t.get('title', '')}\n"
        f"Discussão: {t.get('summary', '')}\n"
        f"Deliberação: {t.get('deliberation', '')}\n"
        f"Encaminhamento: {t.get('encaminhamento', '')}\n"
        f"Responsável: {t.get('responsible', '')} | Prazo: {t.get('deadline', '')}"
        for i, t in enumerate(meeting.get("agenda", []))
    )
    participants = meeting.get("participants", [])
    present = ", ".join(f"{p['name']} ({p.get('role') or 'membro'})" for p in participants if p.get("present", True))
    absent = ", ".join(p["name"] for p in participants if not p.get("present", True))

    extra = []
    if tenant_settings.get("custom_opening"):
        extra.append(f"Fórmula de abertura preferida: {tenant_settings['custom_opening']}")
    if tenant_settings.get("custom_closing"):
        extra.append(f"Fórmula de encerramento preferida: {tenant_settings['custom_closing']}")
    if tenant_settings.get("formal_markers"):
        extra.append("Marcadores formais preferidos: " + ", ".join(tenant_settings["formal_markers"]))

    prompt = f"""Gere a ATA desta reunião seguindo o MODELO DO RPPS descrito abaixo.

MODELO DO RPPS:
{profile_prompt_block(profile, institution)}
{chr(10).join(extra)}

Regras:
- Siga a ordem de seções, as fórmulas de abertura e encerramento e o vocabulário do modelo.
- NÃO repita cabeçalho, rodapé, brasão ou logotipo: eles vêm do arquivo-modelo.
- Use apenas os dados abaixo. Dados ausentes viram [PREENCHER: ...].

DADOS DA REUNIÃO:
- Número: {meeting.get('number')}
- Tipo: {meeting.get('meeting_type')}
- Título: {meeting.get('title')}
- Data: {meeting.get('date')}
- Horário: {meeting.get('start_time') or '[PREENCHER: horário de início]'} às {meeting.get('end_time') or '[PREENCHER: horário de término]'}
- Local: {meeting.get('location') or '[PREENCHER: local]'}
- Presidente/Coordenador: {meeting.get('president') or '[PREENCHER: presidente]'}
- Secretário: {meeting.get('secretary') or '[PREENCHER: secretário]'}
- Presentes: {present or '[PREENCHER: presentes]'}
- Ausentes: {absent or 'nenhum'}

PAUTA E DELIBERAÇÕES:
{agenda_summary or '(sem itens de pauta registrados)'}

Retorne JSON válido:
{{
  "ata_completa": "Texto completo da ata em HTML simples (<h2>, <h3>, <p>, <ul>, <li>, <strong>).",
  "resumo_executivo": "Resumo executivo em 1 parágrafo curto (até 150 palavras).",
  "proxima_pauta_sugerida": "Lista HTML <ul><li>...</li></ul> com 3-5 tópicos para a próxima reunião, com base nas pendências."
}}

Responda APENAS com o JSON."""
    data = chat_json(_ATA_SYSTEM, prompt, tenant_id=tenant_id, operation="generate_ata", max_tokens=8000)
    return {
        "ata_completa": str(data.get("ata_completa", "")),
        "resumo_executivo": str(data.get("resumo_executivo", "")),
        "proxima_pauta_sugerida": str(data.get("proxima_pauta_sugerida", "")),
    }
