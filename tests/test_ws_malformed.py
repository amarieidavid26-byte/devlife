"""A malformed WS message must never kill the game socket.

`_ws_run_error` sliced client-supplied `code`/`error` with no type check (while `lang`
three lines below DID check), so {"code": 123} raised TypeError. Nothing wrapped the
handler dispatch, so it escaped the endpoint entirely -- and because the cleanup lived
only on the WebSocketDisconnect branch, the dead socket stayed in connected_clients.
"""

import json

import pytest
from starlette.testclient import TestClient

MALFORMED = [
    {"type": "run_error", "code": 123, "error": "boom"},
    {"type": "run_error", "code": {"a": 1}, "error": ["x"]},
    {"type": "run_error", "code": 0.5, "error": True},
    {"type": "keystrokes", "events": "not-a-list"},
    {"type": "content_update", "content": 42},
    {"type": "app_focus", "app": 999},
    {"type": "firewall_block", "command": []},
]


@pytest.mark.parametrize("payload", MALFORMED, ids=lambda p: f"{p['type']}-{type(list(p.values())[1]).__name__}")
def test_malformed_message_does_not_kill_the_socket(payload):
    import server

    with TestClient(server.app) as client:
        with client.websocket_connect("/ws") as ws:
            ws.receive_json()
            ws.send_text(json.dumps(payload))
            # the socket must still serve a well-formed message afterwards
            ws.send_text(json.dumps({"type": "app_focus", "app": "terminal"}))


def test_socket_is_removed_from_shared_state_on_any_exit():
    import server

    before = len(server.app_state.connected_clients)
    with TestClient(server.app) as client:
        with client.websocket_connect("/ws") as ws:
            ws.receive_json()
            ws.send_text(json.dumps({"type": "run_error", "code": 123, "error": "boom"}))
            ws.send_text(json.dumps({"type": "app_focus", "app": "terminal"}))
    assert len(server.app_state.connected_clients) == before, "a dead socket stayed in connected_clients"
