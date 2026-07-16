"""ContentAnalyzer with a stubbed Claude client: instant risky detection, JSON parsing
(including fenced output), stuck-detection context, language shaping, failure fallbacks."""

import json
from types import SimpleNamespace

from content_analyzer import ContentAnalyzer


VALID = {
    "app": "code_editor", "language": "python", "activity": "writing a loop",
    "stuck_probability": 0.1, "stuck_reason": None, "mistake_detected": False,
    "mistake_description": None, "help_opportunity": None, "risky_action": False,
    "risky_description": None, "suggested_intervention": None, "context_summary": "loop work",
}


class _StubMessages:
    def __init__(self, text, exc=None):
        self.calls = []
        self._text = text
        self._exc = exc

    def create(self, **kwargs):
        self.calls.append(kwargs)
        if self._exc:
            raise self._exc
        return SimpleNamespace(content=[SimpleNamespace(type="text", text=self._text)])


def _analyzer(text=json.dumps(VALID), exc=None):
    a = ContentAnalyzer(api_key="test-key-not-real")
    a.client = SimpleNamespace(messages=_StubMessages(text, exc))
    return a


def test_risky_terminal_content_skips_api():
    a = _analyzer()
    out = a.analyze("terminal", "sudo rm -rf /var/www")
    assert out["risky_action"] is True
    assert out["suggested_intervention"]["priority"] == "critical"
    assert a.client.messages.calls == []


def test_risky_detection_only_applies_to_terminal():
    a = _analyzer()
    out = a.analyze("code", "subprocess.run('rm -rf build/')")
    assert out["risky_action"] is False
    assert len(a.client.messages.calls) == 1


def test_valid_json_response_parsed():
    a = _analyzer()
    out = a.analyze("code", "for i in range(10):\n    print(i)")
    assert out == VALID
    assert a.last_analysis == VALID


def test_fenced_json_response_parsed():
    a = _analyzer(text="```json\n" + json.dumps(VALID) + "\n```")
    out = a.analyze("code", "x = 1")
    assert out["app"] == "code_editor"


def test_invalid_json_returns_safe_default():
    a = _analyzer(text="sorry, I can't produce JSON today")
    out = a.analyze("notes", "shopping list")
    assert out["app"] == "notes"
    assert out["risky_action"] is False
    assert out["suggested_intervention"] is None


def test_api_error_returns_last_analysis():
    a = _analyzer()
    first = a.analyze("code", "x = 1")
    a.client.messages._exc = RuntimeError("api down")
    out = a.analyze("code", "y = 2")
    assert out == first


def test_api_error_without_history_returns_default():
    a = _analyzer(exc=RuntimeError("api down"))
    out = a.analyze("chat", "hello team")
    assert out["app"] == "chat"
    assert out["activity"] == "unknown"


def test_unchanged_content_flags_stuck_in_prompt():
    a = _analyzer()
    for _ in range(4):
        a.analyze("code", "same exact content")
    last_msg = a.client.messages.calls[-1]["messages"][0]["content"]
    assert "may be stuck" in last_msg


def test_romanian_lang_shapes_system_prompt():
    a = _analyzer()
    a.lang = "ro"
    a.analyze("code", "x = 1")
    assert "Romanian" in a.client.messages.calls[0]["system"]


def test_kwargs_metadata_lands_in_prompt():
    a = _analyzer()
    a.analyze("code", "x = 1", language="python", cursor_line=42)
    msg = a.client.messages.calls[0]["messages"][0]["content"]
    assert "Language: python" in msg
    assert "Cursor at line: 42" in msg
