"""Configuração central, lida exclusivamente de variáveis de ambiente.

Regras de segurança (Etapa 0):
- Nenhum segredo tem valor padrão no código.
- Em produção (APP_ENV=production) a aplicação se recusa a subir sem
  SECRET_KEY forte.
- O superadministrador só é criado se ADMIN_EMAIL e ADMIN_PASSWORD
  estiverem definidos no ambiente.
"""
from __future__ import annotations

import os
import secrets
from pathlib import Path

try:  # .env é opcional (útil em desenvolvimento local)
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parents[2] / ".env")
except Exception:  # pragma: no cover - dotenv ausente
    pass

BACKEND_DIR = Path(__file__).resolve().parents[2]


def _bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


class Settings:
    def __init__(self) -> None:
        self.APP_ENV = os.getenv("APP_ENV", "development").lower()
        self.APP_NAME = os.getenv("APP_NAME", "Atas RPPS")
        self.VERSION = "0.1.0"

        # Banco de dados (SQLite por enquanto; ver docs/PLANO.md para Postgres)
        self.DATABASE_PATH = os.getenv("DATABASE_PATH", str(BACKEND_DIR / "data" / "atas.db"))
        self.UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", str(BACKEND_DIR / "data" / "uploads")))
        self.MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "20"))
        self.MAX_AUDIO_MB = int(os.getenv("MAX_AUDIO_MB", "25"))
        self.MAX_RECORDING_MB = int(os.getenv("MAX_RECORDING_MB", "500"))
        self.MAX_RECORDING_HOURS = float(os.getenv("MAX_RECORDING_HOURS", "6"))

        # Autenticação
        secret = os.getenv("SECRET_KEY", "")
        if not secret:
            if self.is_production:
                raise RuntimeError("SECRET_KEY é obrigatória em produção.")
            # Em desenvolvimento gera uma chave efêmera (sessões caem ao reiniciar).
            secret = secrets.token_urlsafe(48)
        if self.is_production and len(secret) < 32:
            raise RuntimeError("SECRET_KEY deve ter pelo menos 32 caracteres em produção.")
        self.SECRET_KEY = secret
        self.TOKEN_EXPIRE_HOURS = int(os.getenv("TOKEN_EXPIRE_HOURS", "12"))
        # Cadastro público cria um novo RPPS (tenant). Desligado em produção por padrão.
        self.ALLOW_SIGNUP = _bool("ALLOW_SIGNUP", not self.is_production)

        # Superadministrador da plataforma (opcional, só via ambiente)
        self.ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "").strip().lower()
        self.ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "")
        self.ADMIN_NAME = os.getenv("ADMIN_NAME", "Administrador da Plataforma")

        # IA — chamadas diretas aos provedores (sem intermediários)
        self.AI_PROVIDER = os.getenv("AI_PROVIDER", "auto").lower()  # auto|openai|anthropic
        self.OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "").strip()
        self.ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "").strip()
        self.OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4.1")
        self.ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-5-5")
        # Transcrição: hoje via OpenAI (exige OPENAI_API_KEY)
        self.TRANSCRIPTION_MODEL = os.getenv("TRANSCRIPTION_MODEL", "whisper-1")
        self.TRANSCRIPTION_LANGUAGE = os.getenv("TRANSCRIPTION_LANGUAGE", "pt")
        # Vocabulário que ajuda o modelo de transcrição a acertar termos do setor.
        self.TRANSCRIPTION_PROMPT = os.getenv(
            "TRANSCRIPTION_PROMPT",
            "Reunião do Comitê de Investimentos do RPPS. Termos: Regime Próprio de Previdência Social, "
            "Resolução CMN nº 4.963, Política de Investimentos, meta atuarial, IPCA, Selic, CDI, Ibovespa, "
            "IMA-B, IRF-M, IDkA, fundos de renda fixa, renda variável, Pró-Gestão, APR, credenciamento, "
            "aplicação, resgate, carteira, enquadramento, deliberação.",
        )

        # CORS: em produção o frontend é servido pelo próprio backend
        origins = os.getenv("CORS_ORIGINS", "" if self.is_production else "http://localhost:3000")
        self.CORS_ORIGINS = [o.strip() for o in origins.split(",") if o.strip()]

        self.STATIC_DIR = Path(os.getenv("STATIC_DIR", str(BACKEND_DIR / "static")))

    @property
    def is_production(self) -> bool:
        return self.APP_ENV in ("production", "prod")


settings = Settings()
