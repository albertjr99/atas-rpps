"""Atas RPPS — aplicação FastAPI.

Backend consolidado: núcleo e conceito multi-RPPS do AGL Atas + API e fluxo de
reunião do ATA. O frontend (React, visual do ATA) é servido em produção a
partir de STATIC_DIR.
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from .api import admin, auth, kb, meetings, workspace
from .core import llm
from .core.config import settings
from .core.db import get_db, init_db, new_id, now_iso
from .core.security import hash_password

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("atas")


def seed_superadmin() -> None:
    """Cria o superadministrador SOMENTE a partir das variáveis de ambiente."""
    if not (settings.ADMIN_EMAIL and settings.ADMIN_PASSWORD):
        return
    if len(settings.ADMIN_PASSWORD) < 12:
        logger.warning("ADMIN_PASSWORD com menos de 12 caracteres: superadmin NÃO foi criado.")
        return
    with get_db() as conn:
        if conn.execute("SELECT 1 FROM users WHERE email = ?", (settings.ADMIN_EMAIL,)).fetchone():
            return
        row = conn.execute("SELECT id FROM tenants WHERE slug = 'plataforma'").fetchone()
        tenant_id = row["id"] if row else conn.execute(
            "INSERT INTO tenants (name, slug, created_at) VALUES (?,?,?)",
            ("Plataforma", "plataforma", now_iso())).lastrowid
        conn.execute(
            "INSERT INTO users (id, tenant_id, email, name, hashed_pw, role, created_at) VALUES (?,?,?,?,?,?,?)",
            (new_id(), tenant_id, settings.ADMIN_EMAIL, settings.ADMIN_NAME,
             hash_password(settings.ADMIN_PASSWORD), "superadmin", now_iso()),
        )
    logger.info("Superadministrador criado a partir do ambiente.")


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    settings.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    seed_superadmin()
    if not llm.is_configured():
        logger.warning("Nenhuma chave de IA configurada: transcrição e geração de atas ficarão indisponíveis.")
    yield


app = FastAPI(title=settings.APP_NAME, version=settings.VERSION, lifespan=lifespan,
              docs_url=None if settings.is_production else "/api/docs", redoc_url=None, openapi_url=None
              if settings.is_production else "/api/openapi.json")

if settings.CORS_ORIGINS:
    app.add_middleware(CORSMiddleware, allow_origins=settings.CORS_ORIGINS, allow_credentials=False,
                       allow_methods=["*"], allow_headers=["Authorization", "Content-Type"])


@app.middleware("http")
async def security_headers(request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    # Microfone liberado só para o próprio site (gravação das reuniões).
    response.headers.setdefault("Permissions-Policy", "microphone=(self), camera=()")
    return response


api = APIRouter(prefix="/api")
for module in (auth, meetings, workspace, kb, admin):
    api.include_router(module.router)


@api.get("/health")
def health():
    return {"status": "ok", "version": settings.VERSION, "ai": llm.active_provider()}


app.include_router(api)

# ── SPA (build do React) ──────────────────────────────────────────────────────
_static = settings.STATIC_DIR.resolve()
if _static.is_dir():

    @app.get("/{full_path:path}", include_in_schema=False)
    def serve_spa(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404)
        target = (_static / full_path).resolve()
        # Impede path traversal (ex.: /../app/core/config.py)
        if target.is_file() and target.is_relative_to(_static):
            return FileResponse(target)
        return FileResponse(_static / "index.html")
