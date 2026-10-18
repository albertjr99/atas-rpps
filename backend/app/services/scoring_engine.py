"""
Quality scoring engine for ATA documents.
Produces 0-100 scores across 4 dimensions:
  clarity      – Simple language, no ambiguity
  formality    – Official tone, 3rd person
  completeness – All required fields/sections present
  structure    – Follows institutional patterns
"""
import re
from typing import Optional


# ─── Rule-based helpers ───────────────────────────────────────────────────────

_INFORMAL_WORDS = [
    "a gente", "né", "tá", "tô", "pra", "pro", "tudo bem", "beleza", "legal",
    "cara", "nossa", "tipo assim", "meio que", "sei lá",
]

_FORMAL_WORDS = [
    "deliberou", "deliberação", "encaminhamento", "registra-se", "consigna-se",
    "consoante", "outrossim", "doravante", "a seguir", "nos termos",
    "tendo em vista", "com fundamento", "diante do exposto",
]

_THIRD_PERSON_PATTERNS = [
    r"\bfoi\b", r"\bforam\b", r"\bé\b", r"\bsão\b",
    r"\bos membros\b", r"\ba diretoria\b", r"\bo conselho\b",
    r"\ba reunião\b", r"\bapresentou\b", r"\baprovaram\b",
]

_REQUIRED_SECTIONS = [
    "presentes", "pauta", "ordem do dia",
    "delibera", "encerr", "encaminh",
]


def _score_clarity(text: str) -> int:
    """Higher score = simpler, clearer language (paradoxically formal documents should be clear)."""
    if not text:
        return 0
    words = text.split()
    word_count = max(len(words), 1)

    # Penalise very long sentences
    sentences = [s for s in re.split(r"[.!?]+", text) if s.strip()]
    avg_len = sum(len(s.split()) for s in sentences) / max(len(sentences), 1)
    long_sentence_penalty = max(0, int((avg_len - 30) * 1.5))

    # Penalise informal words
    text_lower = text.lower()
    informal_count = sum(1 for w in _INFORMAL_WORDS if w in text_lower)
    informal_penalty = informal_count * 8

    score = max(0, 100 - long_sentence_penalty - informal_penalty)
    return min(100, score)


def _score_formality(text: str) -> int:
    """Higher score = more formal language."""
    if not text:
        return 0
    text_lower = text.lower()

    formal_count = sum(1 for w in _FORMAL_WORDS if w in text_lower)
    third_person = sum(1 for pat in _THIRD_PERSON_PATTERNS if re.search(pat, text_lower))
    informal_count = sum(1 for w in _INFORMAL_WORDS if w in text_lower)

    score = 40 + (formal_count * 5) + (third_person * 4) - (informal_count * 10)
    return max(0, min(100, score))


def _score_completeness(meeting: dict) -> int:
    """Check that critical meeting fields and agenda sections are filled."""
    checks = [
        bool(meeting.get("title")),
        bool(meeting.get("date")),
        bool(meeting.get("location")),
        bool(meeting.get("president") or meeting.get("responsible")),
        bool(meeting.get("participants")),
        bool(meeting.get("agenda")),
        bool(meeting.get("ata_content")),
    ]
    filled_agenda = 0
    total_agenda = 0
    for topic in meeting.get("agenda", []):
        total_agenda += 1
        if topic.get("summary") or topic.get("transcription"):
            filled_agenda += 1

    base = (sum(checks) / len(checks)) * 70
    agenda_pct = (filled_agenda / max(total_agenda, 1)) * 30
    return min(100, int(base + agenda_pct))


def _score_structure(meeting: dict, text: str) -> int:
    """Check that the ATA text covers expected sections."""
    if not text:
        return max(0, 30 if meeting.get("agenda") else 0)
    text_lower = text.lower()
    present = sum(1 for sec in _REQUIRED_SECTIONS if sec in text_lower)
    score = int((present / len(_REQUIRED_SECTIONS)) * 100)
    return max(0, min(100, score))


# ─── Public API ──────────────────────────────────────────────────────────────

def score_meeting(meeting: dict) -> dict:
    """
    Compute all quality scores for a meeting/ATA.
    Returns:
        {
          "overall": int,
          "clarity": int,
          "formality": int,
          "completeness": int,
          "structure": int,
          "grade": "A" | "B" | "C" | "D",
          "color": "green" | "yellow" | "red",
        }
    """
    ata_text = meeting.get("ata_content", "")

    # Combine all text for formality/clarity analysis
    all_text_parts = [ata_text]
    for topic in meeting.get("agenda", []):
        if topic.get("summary"):
            all_text_parts.append(topic["summary"])
        if topic.get("deliberation"):
            all_text_parts.append(topic["deliberation"])
    full_text = " ".join(all_text_parts)

    clarity = _score_clarity(full_text)
    formality = _score_formality(full_text)
    completeness = _score_completeness(meeting)
    structure = _score_structure(meeting, ata_text)

    overall = int((clarity + formality + completeness + structure) / 4)

    if overall >= 80:
        grade, color = "A", "green"
    elif overall >= 60:
        grade, color = "B", "yellow"
    elif overall >= 40:
        grade, color = "C", "orange"
    else:
        grade, color = "D", "red"

    return {
        "overall": overall,
        "clarity": clarity,
        "formality": formality,
        "completeness": completeness,
        "structure": structure,
        "grade": grade,
        "color": color,
    }


def detect_gaps(meeting: dict) -> list[str]:
    """Return list of detected gaps/pending topics."""
    gaps = []
    if not meeting.get("location"):
        gaps.append("Local da reunião não informado")
    if not meeting.get("president") and not meeting.get("responsible"):
        gaps.append("Presidente/coordenador não definido")
    if not meeting.get("participants"):
        gaps.append("Nenhum participante registrado")
    for i, topic in enumerate(meeting.get("agenda", []), 1):
        if topic.get("status") == "completed":
            if not topic.get("deliberation") or "sem deliberação" in (topic.get("deliberation") or "").lower():
                gaps.append(f"Tópico {i} '{topic['title']}': deliberação não registrada")
            if not topic.get("responsible") or topic.get("responsible") == "Não definido":
                gaps.append(f"Tópico {i} '{topic['title']}': responsável não definido")
        elif topic.get("status") != "completed":
            gaps.append(f"Tópico {i} '{topic['title']}': ainda pendente de encerramento")
    if not meeting.get("ata_content"):
        gaps.append("Texto da ata não gerado")
    return gaps
