"""Session report: aggregation math, HTML rendering, endpoints, theme color sync."""

import re
from pathlib import Path

import pytest
from httpx import AsyncClient, ASGITransport

from persistence import db
from session_report import build_report_html, STATE_COLORS


def _fresh_db(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "get_db_path", lambda: str(tmp_path / "t.db"))
    db.reset()
    db._current_session_id = None


def _seed(with_interventions=True):
    sid = db.start_session()
    db.save_biometric(hr=70, hrv=55, recovery=80, strain=6, source="mock", state="RELAXED")
    db.save_biometric(hr=75, hrv=52, recovery=80, strain=6, source="mock", state="RELAXED")
    db.save_biometric(hr=98, hrv=30, recovery=80, strain=9, source="ble", state="STRESSED")
    db.save_biometric(hr=101, hrv=28, recovery=80, strain=9, source="ble", state="STRESSED")
    if with_interventions:
        db.save_intervention(state="STRESSED", source="terminal", claude_text="easy on the force push")
    return sid


def test_report_empty_db(tmp_path, monkeypatch):
    _fresh_db(tmp_path, monkeypatch)
    assert db.get_session_report() is None


def test_report_aggregates(tmp_path, monkeypatch):
    _fresh_db(tmp_path, monkeypatch)
    sid = _seed()
    r = db.get_session_report()
    assert r["session_id"] == sid
    assert r["samples_count"] == 4
    assert r["state_shares"] == {"RELAXED": 0.5, "STRESSED": 0.5}
    assert r["sources"] == {"mock": 2, "ble": 2}
    assert r["hr"] == {"min": 70, "max": 101, "avg": 86}
    assert r["hrv"]["min"] == 28
    assert len(r["interventions"]) == 1
    assert len(r["timeline"]) == 4


def test_report_falls_back_to_latest_session(tmp_path, monkeypatch):
    _fresh_db(tmp_path, monkeypatch)
    sid = _seed()
    db._current_session_id = None  # simulate a fresh process inspecting old data
    r = db.get_session_report()
    assert r["session_id"] == sid


def test_html_contains_states_and_interventions(tmp_path, monkeypatch):
    _fresh_db(tmp_path, monkeypatch)
    _seed()
    page = build_report_html(db.get_session_report(), lang="ro")
    assert "Raport de sesiune DevLife" in page
    assert "RELAXED" in page and "STRESSED" in page
    assert "easy on the force push" in page
    assert "<svg" in page


def test_html_english_and_escaping(tmp_path, monkeypatch):
    _fresh_db(tmp_path, monkeypatch)
    db.start_session()
    db.save_biometric(hr=70, hrv=50, recovery=80, strain=5, source="mock", state="RELAXED")
    db.save_intervention(state="RELAXED", source="code", claude_text="watch out for <script>alert(1)</script>")
    page = build_report_html(db.get_session_report(), lang="en")
    assert "DevLife Session Report" in page
    assert "<script>alert(1)</script>" not in page
    assert "&lt;script&gt;" in page


def test_html_handles_empty_session(tmp_path, monkeypatch):
    _fresh_db(tmp_path, monkeypatch)
    db.start_session()
    page = build_report_html(db.get_session_report(), lang="ro")
    assert "Raport de sesiune" in page


@pytest.mark.asyncio
async def test_report_endpoints(tmp_path, monkeypatch):
    _fresh_db(tmp_path, monkeypatch)
    import server
    _seed()
    transport = ASGITransport(app=server.app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        r = await client.get("/api/session/report")
        assert r.status_code == 200
        assert r.json()["samples_count"] == 4
        r = await client.get("/api/session/report/html")
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("text/html")
        assert "Raport de sesiune" in r.text


@pytest.mark.asyncio
async def test_report_endpoint_404_on_empty_db(tmp_path, monkeypatch):
    _fresh_db(tmp_path, monkeypatch)
    import server
    transport = ASGITransport(app=server.app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        r = await client.get("/api/session/report")
        assert r.status_code == 404


def test_state_colors_match_frontend_theme():
    # anti-drift: the report's server-side palette must equal frontend/src/theme.js
    theme = (Path(__file__).parent.parent / "frontend" / "src" / "theme.js").read_text()
    js_colors = dict(re.findall(r"(\w+):\s*0x([0-9A-Fa-f]{6})", theme))
    assert js_colors, "could not parse STATE_COLORS from theme.js"
    for state, hex_color in STATE_COLORS.items():
        assert state in js_colors, f"{state} missing from theme.js"
        assert hex_color.lstrip("#").upper() == js_colors[state].upper(), f"{state} color drifted"
