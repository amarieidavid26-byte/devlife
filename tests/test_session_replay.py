import pytest
from httpx import AsyncClient, ASGITransport

from persistence import db


def _fresh_db(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "get_db_path", lambda: str(tmp_path / "t.db"))
    db._conn = None
    db._current_session_id = None


def test_timeline_empty_db(tmp_path, monkeypatch):
    _fresh_db(tmp_path, monkeypatch)
    out = db.get_session_timeline()
    assert out == {"session_id": None, "samples": [], "interventions": []}


def test_timeline_returns_samples_and_interventions(tmp_path, monkeypatch):
    _fresh_db(tmp_path, monkeypatch)
    sid = db.start_session()
    db.save_biometric(hr=72, hrv=55, recovery=80, strain=6, source="mock", state="RELAXED")
    db.save_biometric(hr=95, hrv=28, recovery=80, strain=9, source="mock", state="STRESSED")
    db.save_intervention(state="STRESSED", source="terminal", claude_text="breathe bro")
    out = db.get_session_timeline()
    assert out["session_id"] == sid
    assert len(out["samples"]) == 2
    assert out["samples"][1]["state"] == "STRESSED"
    assert len(out["interventions"]) == 1
    assert out["interventions"][0]["claude_text"] == "breathe bro"
    db.end_session()
    db._conn = None
    db._current_session_id = None


@pytest.mark.asyncio
async def test_replay_endpoint():
    import server
    async with AsyncClient(transport=ASGITransport(app=server.app), base_url="http://test") as client:
        resp = await client.get("/api/session/replay")
    assert resp.status_code == 200
    body = resp.json()
    assert "samples" in body and "interventions" in body
