"""Acesso ao banco (SQLite) com isolamento por RPPS (tenant).

Toda consulta de dados de negócio DEVE filtrar por tenant_id. As funções de
repositório nos módulos de API recebem o usuário autenticado e usam o
tenant_id dele, nunca um valor vindo do cliente.
"""
from __future__ import annotations

import json
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

from .config import settings


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id() -> str:
    return str(uuid.uuid4())


@contextmanager
def get_db():
    Path(settings.DATABASE_PATH).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(settings.DATABASE_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


SCHEMA = """
CREATE TABLE IF NOT EXISTS tenants (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    slug        TEXT NOT NULL UNIQUE,
    active      INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
    id          TEXT PRIMARY KEY,
    tenant_id   INTEGER NOT NULL REFERENCES tenants(id),
    email       TEXT NOT NULL UNIQUE,
    name        TEXT NOT NULL,
    hashed_pw   TEXT NOT NULL,
    role        TEXT NOT NULL DEFAULT 'editor',   -- superadmin|admin|editor|viewer
    active      INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS meetings (
    id                TEXT PRIMARY KEY,
    tenant_id         INTEGER NOT NULL REFERENCES tenants(id),
    created_by        TEXT REFERENCES users(id),
    number            INTEGER NOT NULL,
    title             TEXT NOT NULL,
    meeting_type      TEXT NOT NULL DEFAULT 'Reunião Ordinária',
    date              TEXT NOT NULL,
    start_time        TEXT NOT NULL DEFAULT '',
    end_time          TEXT NOT NULL DEFAULT '',
    location          TEXT NOT NULL DEFAULT '',
    responsible       TEXT NOT NULL DEFAULT '',
    secretary         TEXT NOT NULL DEFAULT '',
    president         TEXT NOT NULL DEFAULT '',
    participants_json TEXT NOT NULL DEFAULT '[]',
    agenda_json       TEXT NOT NULL DEFAULT '[]',
    status            TEXT NOT NULL DEFAULT 'scheduled',
    ata_content       TEXT NOT NULL DEFAULT '',
    executive_summary TEXT NOT NULL DEFAULT '',
    next_agenda       TEXT NOT NULL DEFAULT '',
    created_at        TEXT NOT NULL,
    updated_at        TEXT NOT NULL,
    UNIQUE (tenant_id, number)
);
CREATE INDEX IF NOT EXISTS idx_meetings_tenant ON meetings(tenant_id, date DESC);

CREATE TABLE IF NOT EXISTS deliberations (
    id              TEXT PRIMARY KEY,
    tenant_id       INTEGER NOT NULL REFERENCES tenants(id),
    meeting_id      TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    meeting_number  INTEGER NOT NULL,
    topic_id        TEXT,
    topic_title     TEXT NOT NULL,
    decision        TEXT NOT NULL,
    responsible     TEXT NOT NULL DEFAULT '',
    deadline        TEXT NOT NULL DEFAULT '',
    status          TEXT NOT NULL DEFAULT 'aberto',
    created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_delib_tenant ON deliberations(tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS knowledge_docs (
    id          TEXT PRIMARY KEY,
    tenant_id   INTEGER NOT NULL REFERENCES tenants(id),
    filename    TEXT NOT NULL,
    filetype    TEXT NOT NULL,
    file_path   TEXT,
    sha1        TEXT NOT NULL,
    text        TEXT NOT NULL DEFAULT '',
    metadata_json TEXT NOT NULL DEFAULT '{}',
    is_model    INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL,
    UNIQUE (tenant_id, sha1)
);

CREATE TABLE IF NOT EXISTS tenant_settings (
    tenant_id          INTEGER PRIMARY KEY REFERENCES tenants(id),
    data_json          TEXT NOT NULL DEFAULT '{}',
    model_doc_id       TEXT,
    model_profile_json TEXT NOT NULL DEFAULT '{}',
    updated_at         TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_changes (
    id          TEXT PRIMARY KEY,
    tenant_id   INTEGER NOT NULL REFERENCES tenants(id),
    meeting_id  TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    field       TEXT NOT NULL,
    section     TEXT NOT NULL,
    original    TEXT NOT NULL,
    proposed    TEXT NOT NULL,
    rationale   TEXT NOT NULL DEFAULT '',
    status      TEXT NOT NULL DEFAULT 'pending',
    user_note   TEXT NOT NULL DEFAULT '',
    feedback_at TEXT,
    created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS usage_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id   INTEGER NOT NULL,
    operation   TEXT NOT NULL,
    provider    TEXT NOT NULL,
    model       TEXT NOT NULL,
    tokens_in   INTEGER NOT NULL DEFAULT 0,
    tokens_out  INTEGER NOT NULL DEFAULT 0,
    audio_seconds REAL NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL
);
"""


def init_db() -> None:
    with get_db() as conn:
        conn.executescript(SCHEMA)


# ── Serialização ────────────────────────────────────────────────────────────

def meeting_from_row(row: sqlite3.Row) -> dict:
    d = dict(row)
    d["participants"] = json.loads(d.pop("participants_json") or "[]")
    d["agenda"] = json.loads(d.pop("agenda_json") or "[]")
    return d


def user_public(row: sqlite3.Row | dict) -> dict:
    d = dict(row)
    d.pop("hashed_pw", None)
    return d
