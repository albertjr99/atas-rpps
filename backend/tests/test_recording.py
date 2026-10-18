"""Etapa 1: trechos idempotentes, limpeza de alucinações e gravações prontas."""
import json
import shutil
import subprocess

import pytest

from app.core import llm
from app.services import transcripts
from app.services.transcripts import clean_transcription, distribute, split_sentences

from test_api import _meeting_payload

needs_ffmpeg = pytest.mark.skipif(not shutil.which("ffmpeg"), reason="ffmpeg ausente")


def _new_meeting(client, h):
    return client.post("/api/meetings", json=_meeting_payload(), headers=h).json()


def _send(client, h, mid, tid, chunk_id=None, seq=0):
    data = {"seq": str(seq), "duration_ms": "45000"}
    if chunk_id:
        data["chunk_id"] = chunk_id
    return client.post(f"/api/meetings/{mid}/topics/{tid}/transcribe", headers=h, data=data,
                       files={"file": ("trecho.webm", b"\x1a\x45audio", "audio/webm")})


def test_resent_chunk_is_not_transcribed_twice(client, make_tenant, monkeypatch):
    calls = []

    def fake(audio, name, **kw):
        calls.append(kw.get("prompt", ""))
        return f"Trecho {len(calls)}."

    monkeypatch.setattr("app.api.meetings.transcribe", fake)
    h, _ = make_tenant()
    m = _new_meeting(client, h)
    mid, tid = m["id"], m["agenda"][0]["id"]

    assert _send(client, h, mid, tid, "c-1", 0).json() == {"text": "Trecho 1.", "duplicate": False}
    assert _send(client, h, mid, tid, "c-1", 0).json() == {"text": "Trecho 1.", "duplicate": True}
    assert _send(client, h, mid, tid, "c-2", 1).json()["text"] == "Trecho 2."
    assert len(calls) == 2
    assert "Trecho 1." in calls[1]  # o final do texto anterior vai como contexto

    topic = client.get(f"/api/meetings/{mid}", headers=h).json()["agenda"][0]
    assert topic["transcription"] == "Trecho 1. Trecho 2." and topic["status"] == "in_progress"


def test_chunk_ids_do_not_leak_between_tenants(client, make_tenant, monkeypatch):
    monkeypatch.setattr("app.api.meetings.transcribe", lambda audio, name, **kw: "Segredo do RPPS A.")
    ha, _ = make_tenant()
    hb, _ = make_tenant()
    ma, mb = _new_meeting(client, ha), _new_meeting(client, hb)
    _send(client, ha, ma["id"], ma["agenda"][0]["id"], "mesmo-id")

    monkeypatch.setattr("app.api.meetings.transcribe", lambda audio, name, **kw: "Fala do RPPS B.")
    r = _send(client, hb, mb["id"], mb["agenda"][0]["id"], "mesmo-id")
    assert r.json() == {"text": "Fala do RPPS B.", "duplicate": False}
    assert _send(client, hb, ma["id"], ma["agenda"][0]["id"], "mesmo-id").status_code == 404


def test_silence_hallucinations_are_dropped(client, make_tenant, monkeypatch):
    monkeypatch.setattr("app.api.meetings.transcribe",
                        lambda audio, name, **kw: "Legendas pela comunidade Amara.org")
    h, _ = make_tenant()
    m = _new_meeting(client, h)
    assert _send(client, h, m["id"], m["agenda"][0]["id"], "s-1").json()["text"] == ""
    assert client.get(f"/api/meetings/{m['id']}", headers=h).json()["agenda"][0]["transcription"] == ""


def test_clean_transcription_keeps_real_speech():
    text = "O comitê aprovou o resgate. Obrigado por assistir! Inscreva-se no canal. Passamos ao item dois."
    assert clean_transcription(text) == "O comitê aprovou o resgate. Passamos ao item dois."
    assert clean_transcription("A meta atuarial foi IPCA mais 5%.") == "A meta atuarial foi IPCA mais 5%."


def test_distribute_assigns_opening_to_first_item():
    sentences = ["Bom dia.", "Cenário: Selic estável.", "IPCA subiu.", "Aplicação aprovada."]
    out = distribute(sentences, {"b": 3, "a": 1}, "a")
    assert out == {"a": "Bom dia. Cenário: Selic estável. IPCA subiu.", "b": "Aplicação aprovada."}
    assert distribute(sentences, {}, "a") == {"a": " ".join(sentences)}
    assert split_sentences("Um. Dois?  Três!") == ["Um.", "Dois?", "Três!"]


def _tone(tmp_path, seconds=3):
    path = tmp_path / "reuniao.m4a"
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-f", "lavfi", "-i", f"sine=frequency=440:duration={seconds}",
                    "-c:a", "aac", str(path)], check=True)
    return path


@pytest.fixture
def fake_recording_ai(monkeypatch):
    spoken = ("Bom dia a todos, verificado o quórum. O cenário econômico mostra Selic estável. "
              "O IPCA veio acima do esperado. Passamos às aplicações e resgates. Aprovado o resgate de R$ 2 milhões.")
    calls = {"split": 0}

    def fake_chat(system, user, *, operation="chat", **kw):
        assert operation == "agenda_split"
        calls["split"] += 1
        return json.dumps({"inicios": [{"item": 0, "frase": 1}, {"item": 1, "frase": 3}]})

    monkeypatch.setattr(llm, "chat", fake_chat)
    monkeypatch.setattr(transcripts, "transcribe", lambda audio, name, **kw: spoken)
    return calls


@needs_ffmpeg
def test_uploaded_recording_is_split_by_agenda(client, make_tenant, fake_recording_ai, tmp_path):
    h, _ = make_tenant()
    m = _new_meeting(client, h)
    with open(_tone(tmp_path), "rb") as fh:
        r = client.post(f"/api/meetings/{m['id']}/recordings", headers=h,
                        files={"file": ("reuniao.m4a", fh, "audio/mp4")})
    assert r.status_code == 200, r.text
    job = client.get(f"/api/meetings/{m['id']}/jobs/{r.json()['id']}", headers=h).json()
    assert job["status"] == "done", job
    assert job["total"] == 1 and job["progress"] == 1 and job["result"]["warning"] == ""

    agenda = client.get(f"/api/meetings/{m['id']}", headers=h).json()["agenda"]
    assert agenda[0]["transcription"].startswith("Bom dia a todos")
    assert agenda[0]["transcription"].endswith("acima do esperado.")
    assert agenda[1]["transcription"] == "Passamos às aplicações e resgates. Aprovado o resgate de R$ 2 milhões."
    assert fake_recording_ai["split"] == 1


@needs_ffmpeg
def test_recording_for_single_topic_and_ai_split_failure(client, make_tenant, fake_recording_ai, tmp_path,
                                                         monkeypatch):
    h, _ = make_tenant()
    m = _new_meeting(client, h)
    second = m["agenda"][1]["id"]
    with open(_tone(tmp_path), "rb") as fh:
        r = client.post(f"/api/meetings/{m['id']}/recordings", headers=h, data={"topic_id": second},
                        files={"file": ("item.m4a", fh, "audio/mp4")})
    agenda = client.get(f"/api/meetings/{m['id']}", headers=h).json()["agenda"]
    assert agenda[0]["transcription"] == "" and agenda[1]["transcription"].startswith("Bom dia")
    assert fake_recording_ai["split"] == 0

    def boom(*a, **k):
        raise llm.AIError("fora do ar")

    monkeypatch.setattr(llm, "chat", boom)
    m2 = _new_meeting(client, h)
    with open(_tone(tmp_path), "rb") as fh:
        r = client.post(f"/api/meetings/{m2['id']}/recordings", headers=h,
                        files={"file": ("reuniao.m4a", fh, "audio/mp4")})
    job = client.get(f"/api/meetings/{m2['id']}/jobs/{r.json()['id']}", headers=h).json()
    assert job["status"] == "done" and "primeiro item" in job["result"]["warning"]
    agenda = client.get(f"/api/meetings/{m2['id']}", headers=h).json()["agenda"]
    assert agenda[0]["transcription"].endswith("R$ 2 milhões.") and agenda[1]["transcription"] == ""


@needs_ffmpeg
def test_invalid_recording_fails_with_message_and_files_are_removed(client, make_tenant, fake_recording_ai):
    from app.core.config import settings

    h, _ = make_tenant()
    m = _new_meeting(client, h)
    r = client.post(f"/api/meetings/{m['id']}/recordings", headers=h,
                    files={"file": ("reuniao.mp3", b"isto nao e audio", "audio/mpeg")})
    job = client.get(f"/api/meetings/{m['id']}/jobs/{r.json()['id']}", headers=h).json()
    assert job["status"] == "failed" and "Não foi possível ler o áudio" in job["error"]
    assert not [p for p in (settings.UPLOAD_DIR / "recordings").rglob("*") if p.is_file()]


def test_recording_rejects_unknown_type_and_isolates_jobs(client, make_tenant):
    ha, _ = make_tenant()
    hb, _ = make_tenant()
    m = _new_meeting(client, ha)
    r = client.post(f"/api/meetings/{m['id']}/recordings", headers=ha,
                    files={"file": ("planilha.xlsx", b"x", "application/octet-stream")})
    assert r.status_code == 400
    assert client.get(f"/api/meetings/{m['id']}/jobs", headers=hb).status_code == 404
    assert client.get(f"/api/meetings/{m['id']}/jobs", headers=ha).json() == []


def test_manual_note_is_appended_atomically(client, make_tenant, monkeypatch):
    monkeypatch.setattr("app.api.meetings.transcribe", lambda audio, name, **kw: "Fala gravada.")
    h, _ = make_tenant()
    m = _new_meeting(client, h)
    mid, tid = m["id"], m["agenda"][0]["id"]
    _send(client, h, mid, tid, "n-1")
    r = client.post(f"/api/meetings/{mid}/topics/{tid}/note", headers=h, json={"text": "Votação unânime."})
    assert r.status_code == 200
    assert r.json()["transcription"] == "Fala gravada. [Nota manual]: Votação unânime."
    assert client.post(f"/api/meetings/{mid}/topics/{tid}/note", headers=h, json={"text": ""}).status_code == 422
