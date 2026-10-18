"""Configurações do RPPS, usuários e (para o superadmin) cadastro de RPPS."""
from __future__ import annotations

import json
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr

from ..core.db import get_db, new_id, now_iso, user_public
from ..core.security import (get_current_user, hash_password, require_admin, validate_password_strength)
from .auth import slugify
from .common import get_tenant_settings

router = APIRouter(prefix="/admin", tags=["admin"])

TENANT_ROLES = ("admin", "editor", "viewer")
ROLE_ALIASES = {"user": "editor"}  # compatibilidade com o frontend antigo do ATA


def _normalize_role(role: str | None) -> str:
    role = ROLE_ALIASES.get(role or "editor", role or "editor")
    if role not in TENANT_ROLES:
        raise HTTPException(status_code=400, detail="Perfil inválido (use admin, editor ou viewer)")
    return role


# ── Configurações do RPPS ─────────────────────────────────────────────────────

class TenantSettingsIn(BaseModel):
    institution_name: Optional[str] = None
    ata_style: Optional[str] = None
    formal_markers: Optional[List[str]] = None
    custom_opening: Optional[str] = None
    custom_closing: Optional[str] = None
    logo_url: Optional[str] = None
    brasao_url: Optional[str] = None
    default_president: Optional[str] = None
    default_secretary: Optional[str] = None


_DEFAULTS = {
    "institution_name": "", "ata_style": "rpps_padrao", "formal_markers": [], "custom_opening": "",
    "custom_closing": "", "logo_url": "", "brasao_url": "", "default_president": "", "default_secretary": "",
}


@router.get("/settings")
def get_settings(user: dict = Depends(get_current_user)):
    data, _, model_doc_id = get_tenant_settings(user["tenant_id"])
    merged = {**_DEFAULTS, "institution_name": user.get("institution", ""), **data}
    return {**merged, "model_doc_id": model_doc_id}


@router.put("/settings")
def put_settings(payload: TenantSettingsIn, user: dict = Depends(require_admin)):
    tid = user["tenant_id"]
    data, _, _ = get_tenant_settings(tid)
    data.update(payload.model_dump(exclude_none=True))
    with get_db() as conn:
        conn.execute(
            """INSERT INTO tenant_settings (tenant_id, data_json, updated_at) VALUES (?,?,?)
               ON CONFLICT(tenant_id) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at""",
            (tid, json.dumps(data, ensure_ascii=False), now_iso()),
        )
        if payload.institution_name:
            conn.execute("UPDATE tenants SET name = ? WHERE id = ?", (payload.institution_name.strip(), tid))
    return get_settings(user=dict(user, institution=payload.institution_name or user.get("institution", "")))


# ── Usuários do RPPS ──────────────────────────────────────────────────────────

class UserCreateIn(BaseModel):
    name: str
    email: EmailStr
    password: str
    institution: Optional[str] = ""  # ignorado: o usuário sempre entra no RPPS de quem cria
    role: Optional[str] = "editor"


@router.get("/users")
def list_users(user: dict = Depends(require_admin)):
    with get_db() as conn:
        rows = conn.execute(
            """SELECT u.*, t.name AS institution FROM users u JOIN tenants t ON t.id = u.tenant_id
               WHERE u.tenant_id = ? AND u.active = 1 ORDER BY u.created_at""", (user["tenant_id"],)).fetchall()
    return [user_public(r) for r in rows]


@router.post("/users")
def create_user(payload: UserCreateIn, user: dict = Depends(require_admin)):
    role = _normalize_role(payload.role)
    validate_password_strength(payload.password)
    email = payload.email.lower()
    user_id = new_id()
    with get_db() as conn:
        if conn.execute("SELECT 1 FROM users WHERE email = ?", (email,)).fetchone():
            raise HTTPException(status_code=400, detail="E-mail já cadastrado")
        conn.execute(
            "INSERT INTO users (id, tenant_id, email, name, hashed_pw, role, created_at) VALUES (?,?,?,?,?,?,?)",
            (user_id, user["tenant_id"], email, payload.name.strip(), hash_password(payload.password), role, now_iso()),
        )
        row = conn.execute("""SELECT u.*, t.name AS institution FROM users u JOIN tenants t ON t.id = u.tenant_id
                              WHERE u.id = ?""", (user_id,)).fetchone()
    return user_public(row)


@router.delete("/users/{target_id}")
def delete_user(target_id: str, user: dict = Depends(require_admin)):
    if target_id == user["id"]:
        raise HTTPException(status_code=400, detail="Não é possível excluir o próprio usuário")
    with get_db() as conn:
        target = conn.execute("SELECT role FROM users WHERE id = ? AND tenant_id = ?",
                              (target_id, user["tenant_id"])).fetchone()
        if not target:
            raise HTTPException(status_code=404, detail="Usuário não encontrado")
        if target["role"] == "superadmin":
            raise HTTPException(status_code=403, detail="Não é possível excluir o superadministrador")
        # Desativa em vez de apagar, preservando a autoria do histórico.
        conn.execute("UPDATE users SET active = 0 WHERE id = ? AND tenant_id = ?", (target_id, user["tenant_id"]))
    return {"ok": True}


# ── RPPS (somente superadmin da plataforma) ───────────────────────────────────

class TenantCreateIn(BaseModel):
    name: str
    admin_name: str
    admin_email: EmailStr
    admin_password: str


def _require_superadmin(user: dict = Depends(get_current_user)) -> dict:
    if user["role"] != "superadmin":
        raise HTTPException(status_code=403, detail="Acesso restrito ao administrador da plataforma")
    return user


@router.get("/tenants")
def list_tenants(user: dict = Depends(_require_superadmin)):
    with get_db() as conn:
        rows = conn.execute(
            """SELECT t.*, (SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.id AND u.active = 1) AS users,
                      (SELECT COUNT(*) FROM meetings m WHERE m.tenant_id = t.id) AS meetings
               FROM tenants t ORDER BY t.name""").fetchall()
    return [dict(r) for r in rows]


@router.post("/tenants")
def create_tenant(payload: TenantCreateIn, user: dict = Depends(_require_superadmin)):
    validate_password_strength(payload.admin_password)
    email = payload.admin_email.lower()
    with get_db() as conn:
        if conn.execute("SELECT 1 FROM users WHERE email = ?", (email,)).fetchone():
            raise HTTPException(status_code=400, detail="E-mail do administrador já cadastrado")
        base = slugify(payload.name)
        slug, n = base, 1
        while conn.execute("SELECT 1 FROM tenants WHERE slug = ?", (slug,)).fetchone():
            n += 1
            slug = f"{base}-{n}"
        cur = conn.execute("INSERT INTO tenants (name, slug, created_at) VALUES (?,?,?)",
                           (payload.name.strip(), slug, now_iso()))
        conn.execute(
            "INSERT INTO users (id, tenant_id, email, name, hashed_pw, role, created_at) VALUES (?,?,?,?,?,?,?)",
            (new_id(), cur.lastrowid, email, payload.admin_name.strip(), hash_password(payload.admin_password),
             "admin", now_iso()),
        )
        row = conn.execute("SELECT * FROM tenants WHERE id = ?", (cur.lastrowid,)).fetchone()
    return dict(row)
