"""Keystroke dynamics: feature extraction, stress/fatigue scoring, classifier fusion."""

import time

from keystroke_dynamics import KeystrokeDynamics, MIN_EVENTS
from biometric_engine import BiometricEngine


def _fill(ks, iki, count, cat="char"):
    ks.add_events([[iki, cat]] * count)


def test_inactive_below_min_events():
    ks = KeystrokeDynamics()
    _fill(ks, 200, MIN_EVENTS - 5)
    snap = ks.snapshot()
    assert snap["active"] is False
    assert snap["stress"] == 0.5
    assert snap["fatigue"] == 0.0


def test_invalid_events_rejected():
    ks = KeystrokeDynamics()
    ks.add_events([[200, "char"], [-5, "char"], [999999, "char"],
                   [200, "keylogger"], ["a", "char"], [200], "junk"])
    assert len(ks.events) == 1


def test_steady_typing_at_baseline_is_calm():
    ks = KeystrokeDynamics()
    ks.baseline_iki = 200.0
    ks.baseline_err = 0.05
    _fill(ks, 200, 60)
    snap = ks.snapshot()
    assert snap["active"] is True
    assert snap["stress"] == 0.5
    assert snap["fatigue"] == 0.0
    assert snap["iki_median"] == 200.0


def test_fast_bursty_typing_reads_stressed():
    ks = KeystrokeDynamics()
    ks.baseline_iki = 200.0
    ks.baseline_err = 0.02
    # typing at 120ms vs 200ms baseline (speed_ratio 1.67) with heavy corrections
    ks.add_events([[120, "char"]] * 50 + [[120, "backspace"]] * 15)
    snap = ks.snapshot()
    assert snap["stress"] >= 2.0
    assert snap["backspace_ratio"] > 0.2


def test_slow_erratic_typing_reads_fatigued():
    ks = KeystrokeDynamics()
    ks.baseline_iki = 200.0
    ks.baseline_err = 0.02
    # much slower than baseline, wildly variable rhythm, long pauses, corrections
    events = []
    for i in range(40):
        events.append([100 if i % 2 else 900, "char"])
    events += [[2000, "char"]] * 10 + [[400, "backspace"]] * 8
    ks.add_events(events)
    snap = ks.snapshot()
    assert snap["fatigue"] >= 0.65


def test_flow_detection():
    ks = KeystrokeDynamics()
    ks.baseline_iki = 200.0
    ks.baseline_err = 0.05
    _fill(ks, 190, 80)
    snap = ks.snapshot()
    assert snap["flow"] is True


def test_stale_signal_goes_inactive():
    ks = KeystrokeDynamics()
    _fill(ks, 200, 60)
    # age every event past the staleness cutoff
    ks.events = [(t - 20, iki, cat) for t, iki, cat in ks.events]
    assert ks.snapshot()["active"] is False


def test_baseline_learns_slowly():
    ks = KeystrokeDynamics()
    _fill(ks, 200, 60)
    assert ks.baseline_iki == 200.0
    _fill(ks, 100, 60)
    # EMA with alpha 0.05 must move a little, not jump to the new rhythm
    assert 150 < ks.baseline_iki < 200


def test_classify_typing_only_drives_state():
    bio = BiometricEngine()
    bio.access_token = None
    bio.keystrokes.baseline_iki = 200.0
    bio.keystrokes.baseline_err = 0.02
    calm_data = {"recovery": 80, "strain": 5, "sleepPerformance": 0.9, "hrv": 50}

    bio.keystrokes.add_events([[120, "char"]] * 50 + [[120, "backspace"]] * 15)
    assert bio.classify(calm_data) == "STRESSED"

    bio.keystrokes = type(bio.keystrokes)()
    bio.keystrokes.baseline_iki = 200.0
    bio.keystrokes.baseline_err = 0.05
    bio.keystrokes.add_events([[190, "char"]] * 80)
    assert bio.classify(calm_data) == "DEEP_FOCUS"


def test_classify_demo_locked_ignores_typing_takeover():
    bio = BiometricEngine()
    bio.access_token = None
    bio.keystrokes.baseline_iki = 200.0
    bio.keystrokes.baseline_err = 0.02
    bio.keystrokes.add_events([[120, "char"]] * 50 + [[120, "backspace"]] * 15)
    calm_data = {"recovery": 80, "strain": 5, "sleepPerformance": 0.9, "hrv": 50}
    assert bio.classify(calm_data, demo_locked=True) == "RELAXED"


def test_classify_live_hr_outranks_typing():
    bio = BiometricEngine()
    bio.access_token = None
    bio.live_heart_rate = 70
    bio.live_hr_timestamp = time.time()
    bio.keystrokes.baseline_iki = 200.0
    bio.keystrokes.baseline_err = 0.02
    bio.keystrokes.add_events([[120, "char"]] * 50 + [[120, "backspace"]] * 15)
    calm_data = {"recovery": 80, "strain": 5, "sleepPerformance": 0.9, "hrv": 50}
    # a real 70bpm pulse keeps RELAXED, typing only blends into the stress estimate
    assert bio.classify(calm_data) == "RELAXED"
    assert bio.estimated_stress > 0.5
