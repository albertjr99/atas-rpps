"""Camada única de IA, com chamadas diretas a OpenAI ou Anthropic.

Substitui a dependência da Emergent (emergentintegrations + chave universal).
Diferente do cliente do AGL, erros NÃO viram texto: levantam AIError, para que
uma falha de IA nunca acabe gravada dentro de uma ata.
"""
from __future__ import annotations

import io
import json
import logging
import re

from .config import settings
from .db import get_db, now_iso

logger = logging.getLogger(__name__)


class AIError(RuntimeError):
    """Falha ao falar com o provedor de IA (configuração, rede ou resposta inválida)."""


def active_provider() -> str:
    pref = settings.AI_PROVIDER
    if pref == "openai":
        return "openai" if settings.OPENAI_API_KEY else "none"
    if pref == "anthropic":
        return "anthropic" if settings.ANTHROPIC_API_KEY else "none"
    if settings.OPENAI_API_KEY:
        return "openai"
    if settings.ANTHROPIC_API_KEY:
        return "anthropic"
    return "none"


def is_configured() -> bool:
    return active_provider() != "none"


def _log_usage(tenant_id: int | None, operation: str, provider: str, model: str,
               tin: int = 0, tout: int = 0, audio_seconds: float = 0) -> None:
    if tenant_id is None:
        return
    try:
        with get_db() as conn:
            conn.execute(
                """INSERT INTO usage_log (tenant_id, operation, provider, model, tokens_in,
                   tokens_out, audio_seconds, created_at) VALUES (?,?,?,?,?,?,?,?)""",
                (tenant_id, operation, provider, model, tin, tout, audio_seconds, now_iso()),
            )
    except Exception:  # registro de uso nunca deve derrubar a operação
        logger.exception("Falha ao registrar uso de IA")


def chat(system: str, user: str, *, tenant_id: int | None = None, operation: str = "chat",
         temperature: float = 0.2, max_tokens: int = 4096) -> str:
    provider = active_provider()
    if provider == "none":
        raise AIError("Nenhum provedor de IA configurado (defina OPENAI_API_KEY ou ANTHROPIC_API_KEY).")
    try:
        if provider == "openai":
            from openai import OpenAI

            client = OpenAI(api_key=settings.OPENAI_API_KEY)
            resp = client.chat.completions.create(
                model=settings.OPENAI_MODEL,
                messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
                temperature=temperature,
                max_tokens=max_tokens,
            )
            text = resp.choices[0].message.content or ""
            usage = resp.usage
            _log_usage(tenant_id, operation, provider, settings.OPENAI_MODEL,
                       getattr(usage, "prompt_tokens", 0), getattr(usage, "completion_tokens", 0))
            return text

        from anthropic import Anthropic

        client = Anthropic(api_key=settings.ANTHROPIC_API_KEY)
        resp = client.messages.create(
            model=settings.ANTHROPIC_MODEL,
            system=system,
            messages=[{"role": "user", "content": user}],
            temperature=temperature,
            max_tokens=max_tokens,
        )
        text = "".join(getattr(part, "text", "") for part in resp.content)
        usage = resp.usage
        _log_usage(tenant_id, operation, provider, settings.ANTHROPIC_MODEL,
                   getattr(usage, "input_tokens", 0), getattr(usage, "output_tokens", 0))
        return text
    except AIError:
        raise
    except Exception as exc:  # erros de rede/API do SDK
        logger.exception("Erro no provedor de IA (%s)", provider)
        raise AIError(f"Falha na chamada ao provedor de IA ({provider}).") from exc


def parse_json(text: str) -> dict:
    """Extrai JSON de uma resposta, tolerando cercas de markdown."""
    content = (text or "").strip()
    fence = re.match(r"^```(?:json)?\s*(.*?)\s*```$", content, re.DOTALL)
    if fence:
        content = fence.group(1)
    try:
        data = json.loads(content)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", content, re.DOTALL)
        if not match:
            raise AIError("A IA não retornou um JSON válido.")
        try:
            data = json.loads(match.group())
        except json.JSONDecodeError as exc:
            raise AIError("A IA não retornou um JSON válido.") from exc
    if not isinstance(data, dict):
        raise AIError("A IA retornou um JSON em formato inesperado.")
    return data


def chat_json(system: str, user: str, **kwargs) -> dict:
    return parse_json(chat(system, user, **kwargs))


def transcribe(audio: bytes, filename: str, *, tenant_id: int | None = None) -> str:
    """Transcreve um trecho de áudio. Hoje usa a API de áudio da OpenAI."""
    if not settings.OPENAI_API_KEY:
        raise AIError("A transcrição exige OPENAI_API_KEY configurada.")
    try:
        from openai import OpenAI

        client = OpenAI(api_key=settings.OPENAI_API_KEY)
        buf = io.BytesIO(audio)
        buf.name = filename or "audio.webm"
        resp = client.audio.transcriptions.create(
            model=settings.TRANSCRIPTION_MODEL,
            file=buf,
            language=settings.TRANSCRIPTION_LANGUAGE,
        )
        _log_usage(tenant_id, "transcription", "openai", settings.TRANSCRIPTION_MODEL)
        return (getattr(resp, "text", "") or "").strip()
    except Exception as exc:
        logger.exception("Erro na transcrição")
        raise AIError("Falha ao transcrever o áudio.") from exc
