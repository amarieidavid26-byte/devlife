"""/inline WebSocket: token gating + streamed completion (Phase 4)."""

import json

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

import server
import security
import inline_completer

ORIGIN = {"origin": server.ALLOWED_ORIGINS[0]}


def test_state_guidance_is_biometric_aware():
    # the "biometric" in biometric Cursor: tuned safety/quietness by cognitive state
    assert "safety-first" in inline_completer._state_guidance("FATIGUED", 2.0)
    assert "safety-first" in inline_completer._state_guidance("STRESSED", 2.6)
    assert "deep focus" in inline_completer._state_guidance("DEEP_FOCUS", 1.0)
    assert inline_completer._state_guidance("RELAXED", 0.4) == ""


def test_inline_rejects_bad_token():
    client = TestClient(server.app)
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect("/inline?token=bad", headers=ORIGIN):
            pass


def test_inline_streams_completion(monkeypatch):
    async def fake_stream(prefix, suffix, language, path="", state="RELAXED", estimated_stress=0.0):
        assert state  # biometric Cursor passes the live cognitive state through
        for chunk in ["def ", "foo():", " pass"]:
            yield chunk

    monkeypatch.setattr(server.inline_completer, "stream", fake_stream)
    client = TestClient(server.app)
    with client.websocket_connect(f"/inline?token={security.SESSION_TOKEN}", headers=ORIGIN) as ws:
        ws.send_text(json.dumps({"id": 7, "prefix": "def ", "suffix": "", "language": "python", "path": "x.py"}))
        deltas, done = "", False
        for _ in range(12):
            msg = ws.receive_json()
            assert msg["id"] == 7
            if msg.get("delta"):
                deltas += msg["delta"]
            if msg.get("done"):
                done = True
                break
        assert done
        assert deltas == "def foo(): pass"
