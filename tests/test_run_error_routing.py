import json
import pytest
from starlette.testclient import TestClient


def _client():
    import server
    return TestClient(server.app)


def test_run_error_triggers_intervention(monkeypatch):
    import server

    def fake_analyze(app_type, content, extra_context="", **kwargs):
        # contract: extra_context must carry "Runtime error:" for this path
        assert "Runtime error" in extra_context
        return {
            "app": "code_editor",
            "language": kwargs.get("language", "python"),
            "activity": "user hit runtime error",
            "stuck_probability": 0.0,
            "mistake_detected": True,
            "mistake_description": "calling .upper() on None",
            "suggested_intervention": {
                "type": "fix",
                "message": "guard with `if x is None: return ''` first",
                "priority": "high",
                "code_suggestion": "def greet(name):\n    if name is None: return ''\n    return name.upper()",
            },
            "context_summary": "runtime AttributeError",
        }

    def fake_process(analysis, state, modifiers):
        sug = analysis["suggested_intervention"]
        return {
            "type": "intervention",
            "message": sug["message"],
            "priority": "high",
            "buttons": ["Apply Fix", "Show More", "Not Now"],
            "code_suggestion": sug["code_suggestion"],
            "timestamp": 0,
        }

    monkeypatch.setattr(server.content_analyzer, "analyze", fake_analyze)
    monkeypatch.setattr(server.brain, "process", fake_process)

    with _client() as client:
        with client.websocket_connect("/ws") as ws:
            ws.receive_json()  # initial biometric_update
            ws.send_text(json.dumps({
                "type": "run_error",
                "code": "def greet(name): return name.upper()",
                "error": "AttributeError: 'NoneType' object has no attribute 'upper'",
                "language": "python",
            }))

            # background loops may emit other broadcasts — scan a few messages
            for _ in range(8):
                msg = ws.receive_json()
                if msg.get("type") == "intervention":
                    assert msg["app_type"] == "code"
                    assert msg["source"] == "runtime_error"
                    assert "Apply Fix" in msg.get("buttons", [])
                    assert msg.get("code_suggestion")
                    return

            pytest.fail("no intervention received after run_error")


def test_run_error_empty_payload_ignored():
    with _client() as client:
        with client.websocket_connect("/ws") as ws:
            ws.receive_json()
            ws.send_text(json.dumps({
                "type": "run_error",
                "code": "",
                "error": "",
            }))
            # follow-up valid message — server should still be alive
            ws.send_text(json.dumps({"type": "mock_state", "state": 1}))
            msg = ws.receive_json()
    assert msg["type"] == "biometric_update"


def test_run_error_oversize_truncated(monkeypatch):
    import server
    captured = {}

    def fake_analyze(app_type, content, extra_context="", **kwargs):
        captured["content_len"] = len(content)
        captured["context_len"] = len(extra_context)
        return None  # no intervention

    monkeypatch.setattr(server.content_analyzer, "analyze", fake_analyze)

    huge_code = "x = 1\n" * 20000        # ~120 KB
    huge_err = "E" * 200000

    with _client() as client:
        with client.websocket_connect("/ws") as ws:
            ws.receive_json()
            ws.send_text(json.dumps({
                "type": "run_error",
                "code": huge_code,
                "error": huge_err,
                "language": "python",
            }))
            ws.send_text(json.dumps({"type": "mock_state", "state": 1}))
            ws.receive_json()

    assert captured.get("content_len", 0) <= 50000
    # extra_context = "Runtime error from user execution:\n" + error (truncated to 50000)
    assert captured.get("context_len", 0) <= 50100
