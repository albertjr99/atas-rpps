"""Senhas (PBKDF2, herdado do AGL) e tokens JWT (formato usado pelo frontend do ATA)."""
from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import settings
from .db import get_db

_ITERATIONS = 260_000
ROLES = ("superadmin", "admin", "editor", "viewer")
_bearer = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), _ITERATIONS)
    return f"{salt}${digest.hex()}"


def verify_password(password: str, hashed: str) -> bool:
    try:
        salt, stored = hashed.split("$", 1)
    except ValueError:
        return False
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), _ITERATIONS)
    return hmac.compare_digest(digest.hex(), stored)


def validate_password_strength(password: str) -> None:
    if len(password or "") < 8:
        raise HTTPException(status_code=400, detail="A senha deve ter pelo menos 8 caracteres.")


def create_token(user_id: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {"sub": user_id, "iat": now, "exp": now + timedelta(hours=settings.TOKEN_EXPIRE_HOURS)}
    return jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")


def get_current_user(credentials: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> dict:
    if credentials is None:
        raise HTTPException(status_code=401, detail="Não autenticado")
    try:
        payload = jwt.decode(credentials.credentials, settings.SECRET_KEY, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Sessão inválida ou expirada")
    with get_db() as conn:
        row = conn.execute(
            """SELECT u.id, u.tenant_id, u.email, u.name, u.role, u.created_at,
                      t.name AS institution
               FROM users u JOIN tenants t ON t.id = u.tenant_id
               WHERE u.id = ? AND u.active = 1 AND t.active = 1""",
            (payload.get("sub"),),
        ).fetchone()
    if not row:
        raise HTTPException(status_code=401, detail="Usuário não encontrado ou inativo")
    return dict(row)


def require_editor(user: dict = Depends(get_current_user)) -> dict:
    """Pode criar e alterar reuniões (viewer é somente leitura)."""
    if user["role"] == "viewer":
        raise HTTPException(status_code=403, detail="Seu perfil é somente leitura")
    return user


def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user["role"] not in ("admin", "superadmin"):
        raise HTTPException(status_code=403, detail="Acesso restrito a administradores")
    return user
