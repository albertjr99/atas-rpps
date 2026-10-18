from __future__ import annotations

import re
import time
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr

from ..core.config import settings
from ..core.db import get_db, new_id, now_iso
from ..core.security import (create_token, get_current_user, hash_password, validate_password_strength,
                             verify_password)

router = APIRouter(prefix="/auth", tags=["auth"])

# Proteção simples contra força bruta (por e-mail e por IP, em memória).
_FAILURES: dict[str, list[float]] = defaultdict(list)
_WINDOW_SECONDS = 15 * 60
_MAX_FAILURES = 10


def _too_many(key: str) -> bool:
    now = time.time()
    _FAILURES[key] = [t for t in _FAILURES[key] if now - t < _WINDOW_SECONDS]
    return len(_FAILURES[key]) >= _MAX_FAILURES


def slugify(text: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", (text or "").lower()).strip("-")
    return slug[:50] or "rpps"


class RegisterIn(BaseModel):
    name: str
    email: EmailStr
    password: str
    institution: str = ""


class LoginIn(BaseModel):
    email: EmailStr
    password: str


def _login_payload(user_id: str) -> dict:
    with get_db() as conn:
        row = conn.execute(
            """SELECT u.id, u.tenant_id, u.email, u.name, u.role, u.created_at, t.name AS institution
               FROM users u JOIN tenants t ON t.id = u.tenant_id WHERE u.id = ?""",
            (user_id,),
        ).fetchone()
    return {"token": create_token(user_id), "user": dict(row)}


@router.post("/register")
def register(payload: RegisterIn):
    """Cria um novo RPPS e seu primeiro administrador (se o cadastro público estiver habilitado)."""
    if not settings.ALLOW_SIGNUP:
        raise HTTPException(status_code=403, detail="Cadastro público desabilitado. Fale com o administrador.")
    validate_password_strength(payload.password)
    email = payload.email.lower()
    institution = payload.institution.strip() or f"RPPS de {payload.name.strip()}"
    with get_db() as conn:
        if conn.execute("SELECT 1 FROM users WHERE email = ?", (email,)).fetchone():
            raise HTTPException(status_code=400, detail="E-mail já cadastrado")
        base = slugify(institution)
        slug, n = base, 1
        while conn.execute("SELECT 1 FROM tenants WHERE slug = ?", (slug,)).fetchone():
            n += 1
            slug = f"{base}-{n}"
        cur = conn.execute("INSERT INTO tenants (name, slug, created_at) VALUES (?,?,?)",
                           (institution, slug, now_iso()))
        user_id = new_id()
        conn.execute(
            "INSERT INTO users (id, tenant_id, email, name, hashed_pw, role, created_at) VALUES (?,?,?,?,?,?,?)",
            (user_id, cur.lastrowid, email, payload.name.strip(), hash_password(payload.password), "admin", now_iso()),
        )
    return _login_payload(user_id)


@router.post("/login")
def login(payload: LoginIn, request: Request):
    email = payload.email.lower()
    ip = request.client.host if request.client else "?"
    if _too_many(f"e:{email}") or _too_many(f"i:{ip}"):
        raise HTTPException(status_code=429, detail="Muitas tentativas. Aguarde alguns minutos.")
    with get_db() as conn:
        row = conn.execute(
            """SELECT u.id, u.hashed_pw FROM users u JOIN tenants t ON t.id = u.tenant_id
               WHERE u.email = ? AND u.active = 1 AND t.active = 1""",
            (email,),
        ).fetchone()
    if not row or not verify_password(payload.password, row["hashed_pw"]):
        _FAILURES[f"e:{email}"].append(time.time())
        _FAILURES[f"i:{ip}"].append(time.time())
        raise HTTPException(status_code=401, detail="Credenciais inválidas")
    _FAILURES.pop(f"e:{email}", None)
    return _login_payload(row["id"])


@router.get("/me")
def me(user: dict = Depends(get_current_user)):
    return user


@router.get("/config")
def public_config():
    """Informações públicas para a tela de login (ex.: se o cadastro está aberto)."""
    return {"allow_signup": settings.ALLOW_SIGNUP, "app_name": settings.APP_NAME}
