"""LSP bridge (Phase 5): token gating, unavailable-language handling, real pyright handshake."""

import asyncio
import json

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

import server
import security
import lsp_bridge

ORIGIN = {"origin": server.ALLOWED_ORIGINS[0]}


class FakeWS:
    """Minimal async WS double so run_bridge runs in the test's own event loop
    (subprocess creation is reliable there, unlike TestClient's worker thread)."""
    def __init__(self):
        self.inbound = asyncio.Queue()
        self.outbound = asyncio.Queue()

    async def receive(self):
        return await self.inbound.get()

    async def send_text(self, text):
        await self.outbound.put(text)

    async def close(self, code=1000):
        pass

    def client_send(self, text):
        self.inbound.put_nowait({"type": "websocket.receive", "text": text})

    def client_disconnect(self):
        self.inbound.put_nowait({"type": "websocket.disconnect"})


def test_lsp_rejects_bad_token():
    client = TestClient(server.app)
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect("/lsp/python?token=bad", headers=ORIGIN):
            pass


def test_lsp_unavailable_language_reports_error():
    client = TestClient(server.app)
    with client.websocket_connect(f"/lsp/ruby?token={security.SESSION_TOKEN}", headers=ORIGIN) as ws:
        msg = ws.receive_json()
        assert "error" in msg


@pytest.mark.asyncio
@pytest.mark.skipif(not lsp_bridge.server_available("python"), reason="pyright not installed")
async def test_lsp_bridge_initialize_handshake():
    ws = FakeWS()
    task = asyncio.create_task(lsp_bridge.run_bridge(ws, "python"))
    ws.client_send(json.dumps({
        "jsonrpc": "2.0", "id": 1, "method": "initialize",
        "params": {"processId": None, "rootUri": None, "capabilities": {}},
    }))
    got = None
    try:
        for _ in range(40):
            text = await asyncio.wait_for(ws.outbound.get(), timeout=10)
            msg = json.loads(text)
            if msg.get("id") == 1 and "result" in msg:
                got = msg
                break
    finally:
        ws.client_disconnect()
        await asyncio.wait_for(task, timeout=5)
    assert got is not None, "no initialize result from pyright"
    assert "capabilities" in got["result"]
