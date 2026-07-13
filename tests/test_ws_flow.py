import json
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


def test_ws_heart_rate_accepted():
    import server
    import time

    server.bio.live_heart_rate = 0
    server.bio.live_hr_timestamp = 0

    with _client() as client:
        with client.websocket_connect("/ws") as ws:
            ws.receive_json()  # initial biometric
            ws.send_text(json.dumps({"type": "heart_rate", "bpm": 72}))
            # round-trip with a follow-up message so the handler runs before we assert
            ws.send_text(json.dumps({"type": "mock_state", "state": 1}))
            ws.receive_json()

    assert server.bio.live_heart_rate == 72
    assert time.time() - server.bio.live_hr_timestamp < 2


def test_ws_heart_rate_out_of_range_rejected():
    import server
    server.bio.live_heart_rate = 0
    server.bio.live_hr_timestamp = 0

    with _client() as client:
        with client.websocket_connect("/ws") as ws:
            ws.receive_json()
            ws.send_text(json.dumps({"type": "heart_rate", "bpm": 9}))    # too low
            ws.send_text(json.dumps({"type": "heart_rate", "bpm": 300}))  # too high
            ws.send_text(json.dumps({"type": "heart_rate", "bpm": -50}))  # negative
            ws.send_text(json.dumps({"type": "mock_state", "state": 1}))
            ws.receive_json()

    assert server.bio.live_heart_rate == 0  # never updated


def test_ws_heart_rate_wrong_type_ignored():
    import server
    server.bio.live_heart_rate = 0
    server.bio.live_hr_timestamp = 0

    with _client() as client:
        with client.websocket_connect("/ws") as ws:
            ws.receive_json()
            ws.send_text(json.dumps({"type": "heart_rate", "bpm": "fast"}))
            ws.send_text(json.dumps({"type": "heart_rate", "bpm": None}))
            ws.send_text(json.dumps({"type": "heart_rate"}))  # missing bpm
            # server should still be alive
            ws.send_text(json.dumps({"type": "mock_state", "state": 1}))
            msg = ws.receive_json()
            assert msg["type"] == "biometric_update"

    assert server.bio.live_heart_rate == 0
