import os
import sys
import tempfile
from pathlib import Path

import pytest

_TMP = tempfile.mkdtemp(prefix="atas-test-")
os.environ.update({
    "APP_ENV": "test",
    "DATABASE_PATH": str(Path(_TMP) / "test.db"),
    "UPLOAD_DIR": str(Path(_TMP) / "uploads"),
    "STATIC_DIR": str(Path(_TMP) / "static"),
    "SECRET_KEY": "test-secret-key-with-more-than-32-characters",
    "ALLOW_SIGNUP": "true",
    "OPENAI_API_KEY": "",
    "ANTHROPIC_API_KEY": "",
    "ADMIN_EMAIL": "root@plataforma.org",
    "ADMIN_PASSWORD": "uma-senha-bem-longa-123",
})
(Path(_TMP) / "static").mkdir()
(Path(_TMP) / "static" / "index.html").write_text("<html>spa</html>")

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:
        yield c


_counter = {"n": 0}


@pytest.fixture
def make_tenant(client):
    """Cria um RPPS novo com um administrador e devolve os headers de autenticação."""

    def _make(institution: str | None = None):
        _counter["n"] += 1
        n = _counter["n"]
        resp = client.post("/api/auth/register", json={
            "name": f"Admin {n}", "email": f"admin{n}@rpps{n}.org", "password": "senha-segura-1",
            "institution": institution or f"Instituto de Previdência {n}",
        })
        assert resp.status_code == 200, resp.text
        data = resp.json()
        return {"Authorization": f"Bearer {data['token']}"}, data["user"]

    return _make
