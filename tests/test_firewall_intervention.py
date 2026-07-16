"""A terminal firewall block is a real intervention: counted, recorded, broadcast.

Before this, the firewall was a client-only banner -- the ghost stopped you and the
dashboard still said "0 INTERVENTIONS". Also covers the client/server line-mirror sync
and the one-shot "Do it anyway" override.
"""

import json
import time

import pytest
from starlette.testclient import TestClient

import security
from content_analyzer import ContentAnalyzer
from persistence import db
from terminal_pty import KeystrokeFirewall


def _client():
    import server
    return TestClient(server.app)


def _fresh_db(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "get_db_path", lambda: str(tmp_path / "t.db"))
    db._conn = None
    db._current_session_id = None


def _force_state(server, monkeypatch, state):
    # the biometric loop re-classifies every cycle, so pin classify itself -- setting
    # bio.current_state alone is overwritten within milliseconds
    def fake_classify(data=None, demo_locked=False):
        server.bio.current_state = state
        return state

    monkeypatch.setattr(server.bio, "classify", fake_classify)
    server.bio.current_state = state


def test_firewall_block_broadcasts_and_counts(tmp_path, monkeypatch):
    import server

    _fresh_db(tmp_path, monkeypatch)
    _force_state(server, monkeypatch, "STRESSED")
    before = server.brain.intervention_count

    with _client() as client:
        with client.websocket_connect("/ws") as ws:
            ws.receive_json()  # initial biometric_update
            ws.send_text(json.dumps({
                "type": "firewall_block",
                "command": "git push --force",
                "description": "force push to a remote branch",
            }))

            for _ in range(8):
                msg = ws.receive_json()
                if msg.get("type") == "intervention":
                    assert msg["source"] == "terminal_firewall"
                    assert msg["reason"] == "stress_firewall"
                    assert msg["priority"] == "critical"
                    # the terminal draws its own banner; the bubble would hide behind it
                    assert msg["silent"] is True
                    assert msg["state"] == "STRESSED"
                    assert msg["message"]
                    break
            else:
                pytest.fail("no intervention broadcast after firewall_block")

    assert server.brain.intervention_count == before + 1
    rows = db.get_interventions()
    assert any(r["source"] == "terminal_firewall" for r in rows)


def test_firewall_block_reason_follows_state(tmp_path, monkeypatch):
    import server

    _fresh_db(tmp_path, monkeypatch)
    _force_state(server, monkeypatch, "FATIGUED")

    with _client() as client:
        with client.websocket_connect("/ws") as ws:
            ws.receive_json()
            ws.send_text(json.dumps({
                "type": "firewall_block",
                "command": "rm -rf /",
                "description": "recursive delete",
            }))
            for _ in range(8):
                msg = ws.receive_json()
                if msg.get("type") == "intervention":
                    assert msg["reason"] == "fatigue_firewall"
                    return
    pytest.fail("no intervention broadcast")


def test_firewall_block_rejects_junk(tmp_path, monkeypatch):
    _fresh_db(tmp_path, monkeypatch)
    with _client() as client:
        with client.websocket_connect("/ws") as ws:
            ws.receive_json()
            # empty command, and an oversize one -- neither may produce an intervention
            ws.send_text(json.dumps({"type": "firewall_block", "command": ""}))
            ws.send_text(json.dumps({"type": "firewall_block", "command": "x" * 5000}))
            ws.send_text(json.dumps({"type": "mock_state", "state": 1}))
            msg = ws.receive_json()
    assert msg["type"] == "biometric_update"


_ca = ContentAnalyzer.__new__(ContentAnalyzer)


def _risky_only(line):
    risky, desc = _ca.detect_risky_commands(line)
    return desc if risky else None


def test_cancel_byte_keeps_the_server_mirror_in_sync():
    """Cancel used to send Ctrl-A/Ctrl-K, which the server firewall does not treat as a
    line-kill: its buffer kept the risky command and poisoned the NEXT one typed."""
    stale = KeystrokeFirewall(_risky_only)
    stale.filter(b"git push --force")
    stale.filter(b"\x01\x0b")                    # the old Cancel bytes
    _, blocked = stale.filter(b"ls\r")
    assert blocked, "regression guard: Ctrl-A/Ctrl-K must not be treated as a line-kill"

    synced = KeystrokeFirewall(_risky_only)
    synced.filter(b"git push --force")
    synced.filter(b"\x15")                       # what Cancel sends now (Ctrl-U)
    out, blocked = synced.filter(b"ls\r")
    assert blocked == []
    assert out == b"ls\r"


def _collect(ws, needle, seconds=6):
    got = b""
    deadline = time.time() + seconds
    while time.time() < deadline:
        try:
            got += ws.receive_bytes()
        except Exception:
            break
        if needle in got:
            return got
    return got


def test_do_it_anyway_override_is_one_shot(monkeypatch):
    """'Do it anyway' must actually run the command (it used to be swallowed by the
    server firewall), and must not leave a standing bypass behind."""
    import server

    _force_state(server, monkeypatch, "STRESSED")
    origin = {"origin": server.ALLOWED_ORIGINS[0]}
    client = TestClient(server.app)
    with client.websocket_connect(f"/terminal?token={security.SESSION_TOKEN}", headers=origin) as ws:
        ws.send_text(json.dumps({"type": "resize", "rows": 30, "cols": 100}))

        # 'env' is in the risky list (it can dump secrets) and is harmless to actually run
        ws.send_bytes(b"env\r")
        assert b"\xe2\x9b\x94" in _collect(ws, b"\xe2\x9b\x94"), "risky command was not blocked"

        # arm the one-shot override, then re-send: this one must go through
        ws.send_text(json.dumps({"type": "firewall_override"}))
        ws.send_bytes(b"env\r")
        assert b"PATH=" in _collect(ws, b"PATH="), "override did not let the command run"

        # the override is consumed -- the next risky command is blocked again
        ws.send_bytes(b"env\r")
        assert b"\xe2\x9b\x94" in _collect(ws, b"\xe2\x9b\x94"), "override leaked into a standing bypass"
