"""GhostBrain decision engine with a stubbed Claude client: intervention logic,
instant firewall templates, personality/language prompt shaping, API-failure fallback."""

import time
from types import SimpleNamespace

from ghost_brain import GhostBrain, get_biometric_insight


class _StubMessages:
    def __init__(self, text="ok ghost line", exc=None):
        self.calls = []
        self._text = text
        self._exc = exc

    def create(self, **kwargs):
        self.calls.append(kwargs)
        if self._exc:
            raise self._exc
        return SimpleNamespace(content=[SimpleNamespace(type="text", text=self._text)])


def _brain(text="ok ghost line", exc=None):
    b = GhostBrain(api_key="test-key-not-real")
    b.client = SimpleNamespace(messages=_StubMessages(text, exc))
    return b


MODS = {"estimated_stress": 1.0, "hrv_baseline": 50, "intervention_threshold": 0.5, "max_tokens": 100}


# --- get_biometric_insight ---

def test_insight_low_hrv():
    assert "really low" in get_biometric_insight({"hrv": 25})


def test_insight_burnout_combo():
    out = get_biometric_insight({"hrv": 45, "recovery": 30, "strain": 16})
    assert "not sustainable" in out


def test_insight_peak_state():
    out = get_biometric_insight({"hrv": 75, "recovery": 85})
    assert out is not None


def test_insight_none_when_unremarkable():
    assert get_biometric_insight({"hrv": 50, "recovery": 60, "strain": 8}) is None


# --- should_intervene ---

def test_risky_action_respects_10s_cooldown():
    b = _brain()
    b.last_intervention_time = time.time()
    ok, reason = b.should_intervene({"risky_action": True}, "RELAXED", MODS)
    assert (ok, reason) == (False, "cooldown")


def test_risky_action_firewalls_by_state():
    b = _brain()
    assert b.should_intervene({"risky_action": True}, "FATIGUED", MODS) == (True, "fatigue_firewall")
    assert b.should_intervene({"risky_action": True}, "STRESSED", MODS) == (True, "stress_firewall")
    assert b.should_intervene({"risky_action": True}, "RELAXED", MODS) == (True, "risky_action_detected")


def test_mistake_with_high_stress_is_stress_firewall():
    b = _brain()
    mods = dict(MODS, estimated_stress=2.5)
    assert b.should_intervene({"mistake_detected": True}, "WIRED", mods) == (True, "stress_firewall")


def test_stuck_over_threshold_triggers():
    b = _brain()
    ok, reason = b.should_intervene({"stuck_probability": 0.8}, "RELAXED", MODS)
    assert (ok, reason) == (True, "stuck_detected")


def test_deep_focus_is_protected():
    b = _brain()
    ok, reason = b.should_intervene({"stuck_probability": 0.1}, "DEEP_FOCUS",
                                    dict(MODS, intervention_threshold=0.9))
    assert (ok, reason) == (False, "protecting_flow")


def test_ignored_feedback_stretches_cooldown():
    b = _brain()
    b.ignored_count = 3
    b.last_intervention_time = time.time() - 45  # past normal 30s, inside stretched 60s
    ok, reason = b.should_intervene({"stuck_probability": 0.9}, "RELAXED", MODS)
    assert (ok, reason) == (False, "cooldown")


# --- process: instant firewall templates (no API call) ---

def test_firewall_uses_template_not_api():
    b = _brain()
    analysis = {"risky_action": True, "risky_description": "git push --force"}
    out = b.process(analysis, "FATIGUED", MODS)
    assert out["priority"] == "critical"
    assert "FATIGUE FIREWALL" in out["message"]
    assert "git push --force" in out["message"]
    assert out["buttons"] == ["Save Draft", "Do It Anyway", "Remind Later"]
    assert b.client.messages.calls == []


def test_firewall_template_romanian():
    b = _brain()
    b.lang = "ro"
    analysis = {"risky_action": True, "risky_description": "rm -rf"}
    out = b.process(analysis, "STRESSED", MODS)
    assert "ALERTA DE STRES" in out["message"]
    assert b.client.messages.calls == []


def test_risky_in_relaxed_state_marks_risky():
    b = _brain()
    analysis = {"risky_action": True, "risky_description": "DROP TABLE users"}
    out = b.process(analysis, "RELAXED", MODS)
    assert out["risky"] is True
    assert out["priority"] == "critical"
    assert "Cancel" in out["buttons"]


# --- process: Claude-backed path with stubbed client ---

def test_process_calls_claude_for_mistakes():
    b = _brain(text="that loop never terminates, look at line 3")
    out = b.process({"mistake_detected": True, "context_summary": "python loop"}, "RELAXED", MODS)
    assert out["message"] == "that loop never terminates, look at line 3"
    assert out["priority"] == "high"
    assert len(b.client.messages.calls) == 1


def test_personality_and_lang_shape_system_prompt():
    b = _brain()
    b.personality = "coach"
    b.lang = "ro"
    b.process({"mistake_detected": True}, "RELAXED", MODS)
    system = b.client.messages.calls[0]["system"]
    assert "STRICT COACH" in system
    assert "Respond in Romanian" in system


def test_api_error_falls_back_to_suggested_intervention():
    b = _brain(exc=RuntimeError("api down"))
    analysis = {"mistake_detected": True,
                "suggested_intervention": {"message": "canned fallback", "code_suggestion": None}}
    out = b.process(analysis, "RELAXED", MODS)
    assert out["message"] == "canned fallback"


def test_api_error_without_suggestion_returns_none():
    b = _brain(exc=RuntimeError("api down"))
    assert b.process({"mistake_detected": True}, "RELAXED", MODS) is None


def test_code_suggestion_switches_buttons():
    b = _brain()
    analysis = {"mistake_detected": True,
                "suggested_intervention": {"message": "m", "code_suggestion": "fixed code"}}
    out = b.process(analysis, "RELAXED", MODS)
    assert out["buttons"] == ["Apply Fix", "Show More", "Not Now"]
    assert out["code_suggestion"] == "fixed code"


# --- feedback loop ---

def test_user_feedback_counters():
    b = _brain()
    b.user_feedback("Thanks")
    b.user_feedback("Apply Fix")
    b.user_feedback("Not Now")
    assert b.accepted_count == 2
    assert b.ignored_count == 1
