"""Base de conhecimento do RPPS e ata-modelo."""
from __future__ import annotations

import json
import os

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from ..core.config import settings
from ..core.db import get_db, new_id, now_iso
from ..core.security import get_current_user, require_admin, require_editor
from ..services.document_features import extract_document_features
from ..services.model_profile import profile_from_docx, profile_from_text
from .common import get_tenant_settings

router = APIRouter(prefix="/kb", tags=["knowledge-base"])

ALLOWED_EXT = {"pdf", "docx", "xlsx", "csv", "txt"}


def _public(row) -> dict:
    d = dict(row)
    d.pop("text", None)
    d.pop("file_path", None)
    d["metadata"] = json.loads(d.pop("metadata_json") or "{}")
    d["is_model"] = bool(d.get("is_model"))
    return d


def _set_model(tenant_id: int, doc_id: str) -> dict:
    with get_db() as conn:
        row = conn.execute("SELECT * FROM knowledge_docs WHERE id = ? AND tenant_id = ?",
                           (doc_id, tenant_id)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Documento não encontrado")
    if row["filetype"] not in ("docx", "pdf", "txt"):
        raise HTTPException(status_code=400, detail="A ata-modelo deve ser DOCX (recomendado), PDF ou TXT")
    if row["filetype"] == "docx" and row["file_path"]:
        with open(row["file_path"], "rb") as fh:
            profile = profile_from_docx(fh.read())
    else:
        profile = profile_from_text(row["text"])
    data, _, _ = get_tenant_settings(tenant_id)
    with get_db() as conn:
        conn.execute("UPDATE knowledge_docs SET is_model = (id = ?) WHERE tenant_id = ?", (doc_id, tenant_id))
        conn.execute(
            """INSERT INTO tenant_settings (tenant_id, data_json, model_doc_id, model_profile_json, updated_at)
               VALUES (?,?,?,?,?)
               ON CONFLICT(tenant_id) DO UPDATE SET model_doc_id = excluded.model_doc_id,
                   model_profile_json = excluded.model_profile_json, updated_at = excluded.updated_at""",
            (tenant_id, json.dumps(data, ensure_ascii=False), doc_id, json.dumps(profile, ensure_ascii=False), now_iso()),
        )
    return profile


@router.post("/upload")
async def kb_upload(file: UploadFile = File(...), user: dict = Depends(require_editor)):
    tid = user["tenant_id"]
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Arquivo vazio")
    if len(data) > settings.MAX_UPLOAD_MB * 1024 * 1024:
        raise HTTPException(status_code=400, detail=f"Arquivo excede {settings.MAX_UPLOAD_MB} MB")
    filename = os.path.basename(file.filename or "documento")
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in ALLOWED_EXT:
        raise HTTPException(status_code=400, detail="Formato não suportado. Envie PDF, DOCX, XLSX, CSV ou TXT.")

    text, metadata = extract_document_features(filename, ext, data)
    with get_db() as conn:
        existing = conn.execute("SELECT * FROM knowledge_docs WHERE tenant_id = ? AND sha1 = ?",
                                (tid, metadata["sha1"])).fetchone()
    if existing:
        return _public(existing)

    doc_id = new_id()
    folder = settings.UPLOAD_DIR / str(tid)
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"{doc_id}.{ext}"
    path.write_bytes(data)
    with get_db() as conn:
        conn.execute(
            """INSERT INTO knowledge_docs (id, tenant_id, filename, filetype, file_path, sha1, text,
               metadata_json, created_at) VALUES (?,?,?,?,?,?,?,?,?)""",
            (doc_id, tid, filename, ext, str(path), metadata["sha1"], text,
             json.dumps(metadata, ensure_ascii=False), now_iso()),
        )
    # O primeiro DOCX enviado vira a ata-modelo automaticamente (pode ser trocado depois).
    _, _, model_doc_id = get_tenant_settings(tid)
    if ext == "docx" and not model_doc_id:
        _set_model(tid, doc_id)
    with get_db() as conn:
        row = conn.execute("SELECT * FROM knowledge_docs WHERE id = ?", (doc_id,)).fetchone()
    return _public(row)


@router.get("")
def kb_list(user: dict = Depends(get_current_user)):
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM knowledge_docs WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 200",
                            (user["tenant_id"],)).fetchall()
    return [_public(r) for r in rows]


@router.get("/search")
def kb_search(q: str, user: dict = Depends(get_current_user)):
    if not q or len(q) < 2:
        return []
    like = f"%{q}%"
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM knowledge_docs WHERE tenant_id = ? AND (filename LIKE ? OR text LIKE ?) LIMIT 20",
            (user["tenant_id"], like, like)).fetchall()
    return [_public(r) for r in rows]


@router.get("/model")
def kb_model(user: dict = Depends(get_current_user)):
    """Perfil extraído da ata-modelo atual (o que a IA está usando como referência)."""
    _, profile, model_doc_id = get_tenant_settings(user["tenant_id"])
    profile = dict(profile)
    profile.pop("sample_text", None)
    return {"model_doc_id": model_doc_id, "profile": profile}


@router.post("/{doc_id}/set-model")
def kb_set_model(doc_id: str, user: dict = Depends(require_admin)):
    profile = _set_model(user["tenant_id"], doc_id)
    profile.pop("sample_text", None)
    return {"ok": True, "model_doc_id": doc_id, "profile": profile}


@router.get("/{doc_id}")
def kb_get(doc_id: str, user: dict = Depends(get_current_user)):
    with get_db() as conn:
        row = conn.execute("SELECT * FROM knowledge_docs WHERE id = ? AND tenant_id = ?",
                           (doc_id, user["tenant_id"])).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Documento não encontrado")
    return _public(row)


@router.delete("/{doc_id}")
def kb_delete(doc_id: str, user: dict = Depends(require_editor)):
    tid = user["tenant_id"]
    with get_db() as conn:
        row = conn.execute("SELECT file_path FROM knowledge_docs WHERE id = ? AND tenant_id = ?",
                           (doc_id, tid)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Documento não encontrado")
        conn.execute("DELETE FROM knowledge_docs WHERE id = ? AND tenant_id = ?", (doc_id, tid))
        conn.execute("""UPDATE tenant_settings SET model_doc_id = NULL, model_profile_json = '{}'
                        WHERE tenant_id = ? AND model_doc_id = ?""", (tid, doc_id))
    if row["file_path"]:
        try:
            os.remove(row["file_path"])
        except OSError:
            pass
    return {"ok": True}
