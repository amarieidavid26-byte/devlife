# Tests for the "why this state" explainability payload (feature 1A).
# The breakdown is built inside classify() (single source of truth) and emitted by
# build_biometric_msg; a forced demo state must get an honest stub, not a stale mismatch.
import json
import time

import runtime
from biometric_engine import BiometricEngine


def _bio():
    return BiometricEngine("", "")


def _factor(exp, key):
    return next(f for f in exp["factors"] if f["key"] == key)


def test_classify_sets_explanation_matching_state():
    b = _bio()
    st = b.classify({"recovery": 70, "strain": 10, "sleepPerformance": 0.9, "hrv": 55})
    assert b.last_explanation is not None
    assert b.last_explanation["state"] == st


def test_live_pulse_high_is_decisive():
    b = _bio()
    b.live_heart_rate = 104
    b.live_hr_timestamp = time.time()
    b.classify({"recovery": 70, "strain": 10, "sleepPerformance": 0.9, "hrv": 55})
    exp = b.last_explanation
    assert exp["state"] == "STRESSED"
    assert exp["signal"] == "live_pulse"
    assert exp["reason_key"] == "hr_very_high"
    assert exp["reason_vars"] == {"hr": 104, "thr": 100}
    assert _factor(exp, "heart_rate")["effect"] == "decisive"


def test_whoop_recovery_vetoes_normal_pulse():
    b = _bio()
    b.access_token = "x"
    b.live_heart_rate = 80
    b.live_hr_timestamp = time.time()
    b.classify({"recovery": 32, "strain": 12, "sleepPerformance": 0.9, "hrv": 50})
    exp = b.last_explanation
    assert exp["state"] == "FATIGUED"
    assert exp["reason_key"] == "whoop_veto_recovery"
    assert _factor(exp, "recovery")["effect"] == "veto"


def test_high_strain_marks_strain_decisive():
    b = _bio()
    b.classify({"recovery": 70, "strain": 18, "sleepPerformance": 0.9, "hrv": 55})
    exp = b.last_explanation
    assert exp["state"] == "STRESSED"
    assert exp["reason_key"] == "high_strain"
    assert _factor(exp, "strain")["effect"] == "decisive"


def test_factors_are_json_safe_and_well_formed():
    b = _bio()
    b.classify({"recovery": 55, "strain": 10, "sleepPerformance": 0.8, "hrv": 48})
    json.dumps(b.last_explanation)  # must not raise
    assert b.last_explanation["factors"], "expected at least one factor"
    for f in b.last_explanation["factors"]:
        assert {"key", "value", "effect"} <= set(f)


def test_build_biometric_msg_includes_matching_explanation():
    runtime.bio.live_heart_rate = 0
    runtime.bio.live_hr_timestamp = 0
    state = runtime.bio.classify({"recovery": 70, "strain": 10, "sleepPerformance": 0.9, "hrv": 55})
    msg = runtime.build_biometric_msg(
        {"heartRate": 70, "recovery": 70, "strain": 10, "sleepPerformance": 0.9, "hrv": 55}, state
    )
    assert "state_explanation" in msg
    assert msg["state_explanation"]["state"] == state


def test_demo_explanation_populates_factors_for_forced_state():
    # keys 1-5 force a state and skip classify(); the panel should still show the demo numbers
    b = _bio()
    b.set_demo_explanation("FATIGUED", {"heartRate": 78, "recovery": 30, "strain": 15,
                                        "sleepPerformance": 0.6, "hrv": 42})
    exp = b.last_explanation
    assert exp["state"] == "FATIGUED"
    assert exp["signal"] == "forced"
    assert exp["reason_key"] == "demo_forced"
    assert exp["factors"], "demo explanation should still surface the underlying numbers"
    assert _factor(exp, "recovery")["value"] == 30


def test_forced_state_gets_honest_stub():
    # emit a state classify() did not produce (a forced demo state) -> stub, never a stale mismatch
    runtime.bio.classify({"recovery": 70, "strain": 10, "sleepPerformance": 0.9, "hrv": 55})
    forced = "WIRED" if runtime.bio.last_explanation["state"] != "WIRED" else "STRESSED"
    msg = runtime.build_biometric_msg({"heartRate": 70}, forced)
    assert msg["state_explanation"]["signal"] == "forced"
    assert msg["state_explanation"]["reason_key"] == "demo_forced"
    assert msg["state_explanation"]["factors"] == []
