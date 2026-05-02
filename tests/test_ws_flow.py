import json
import pytest
from starlette.testclient import TestClient


def _client():
    import server
    return TestClient(server.app)


def test_ws_connects_and_receives_biometric():
    with _client() as client:
        with client.websocket_connect("/ws") as ws:
            msg = ws.receive_json()
    assert msg["type"] == "biometric_update"
    assert "heartRate" in msg
    assert "state" in msg


def test_ws_mock_state_accepted():
    import server
    with _client() as client:
        with client.websocket_connect("/ws") as ws:
            ws.receive_json()  # initial biometric
            ws.send_text(json.dumps({"type": "mock_state", "state": 3}))
            msg = ws.receive_json()
    # server echoes a biometric_update after mock_state — transition is async
    # so we just verify the response type, not the exact state mid-transition
    assert msg["type"] == "biometric_update"
    assert server.mock.current_preset == 3


def test_ws_invalid_json_ignored():
    with _client() as client:
        with client.websocket_connect("/ws") as ws:
            ws.receive_json()
            ws.send_text("not json at all")
            ws.send_text(json.dumps({"type": "mock_state", "state": 1}))
            msg = ws.receive_json()
    assert msg["type"] == "biometric_update"


def test_ws_content_update_accepted():
    with _client() as client:
        with client.websocket_connect("/ws") as ws:
            ws.receive_json()
            ws.send_text(json.dumps({
                "type": "content_update",
                "app_type": "code",
                "content": "def foo(): pass",
                "language": "python",
            }))
            # no crash = content accepted into pending_content


def test_ws_feedback_accepted():
    with _client() as client:
        with client.websocket_connect("/ws") as ws:
            ws.receive_json()
            ws.send_text(json.dumps({"type": "feedback", "action": "Thanks"}))
            # no crash = feedback processed
