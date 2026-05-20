"""End-to-end /terminal WebSocket: token gating + real shell echo (Phase 2)."""

import json
import time

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

import server
import security

ORIGIN = {"origin": server.ALLOWED_ORIGINS[0]}


def test_terminal_rejects_without_token():
    client = TestClient(server.app)
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect("/terminal", headers=ORIGIN):
            pass


def test_terminal_rejects_bad_token():
    client = TestClient(server.app)
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect("/terminal?token=forged", headers=ORIGIN):
            pass


def test_terminal_echo_with_token():
    client = TestClient(server.app)
    tok = security.SESSION_TOKEN
    with client.websocket_connect(f"/terminal?token={tok}", headers=ORIGIN) as ws:
        ws.send_text(json.dumps({"type": "resize", "rows": 30, "cols": 100}))
        ws.send_bytes(b"echo terminaltest123\n")
        collected = b""
        deadline = time.time() + 6
        while time.time() < deadline:
            collected += ws.receive_bytes()
            if b"terminaltest123" in collected:
                break
        assert b"terminaltest123" in collected
