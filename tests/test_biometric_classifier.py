from biometric_engine import BiometricEngine


def _bio():
    return BiometricEngine("", "")


def test_fatigued_on_low_recovery():
    bio = _bio()
    state = bio.classify({"recovery": 25, "strain": 5, "sleepPerformance": 0.5, "hrv": 50, "heartRate": 60})
    assert state == "FATIGUED"


def test_fatigued_on_bad_sleep():
    bio = _bio()
    state = bio.classify({"recovery": 60, "strain": 6, "sleepPerformance": 0.55, "hrv": 55, "heartRate": 62})
    assert state == "FATIGUED"


def test_stressed_on_high_strain():
    bio = _bio()
    state = bio.classify({"recovery": 50, "strain": 18, "sleepPerformance": 0.75, "hrv": 20, "heartRate": 90})
    assert state == "STRESSED"


def test_relaxed_on_good_recovery():
    bio = _bio()
    state = bio.classify({"recovery": 85, "strain": 4, "sleepPerformance": 0.9, "hrv": 72, "heartRate": 65})
    assert state == "RELAXED"


def test_deep_focus_on_moderate_strain():
    bio = _bio()
    # hrv=40, baseline=50 → ratio=0.8 → estimated_stress=1.2, meets DEEP_FOCUS conditions
    state = bio.classify({"recovery": 70, "strain": 11, "sleepPerformance": 0.82, "hrv": 40, "heartRate": 68})
    assert state == "DEEP_FOCUS"


def test_wired_on_high_strain_low_recovery():
    bio = _bio()
    state = bio.classify({"recovery": 50, "strain": 14, "sleepPerformance": 0.70, "hrv": 35, "heartRate": 85})
    assert state == "WIRED"


def test_state_change_callback_fires():
    bio = _bio()
    changes = []
    bio.on_state_change(lambda old, new: changes.append((old, new)))
    bio.classify({"recovery": 85, "strain": 4, "sleepPerformance": 0.9, "hrv": 72, "heartRate": 65})
    bio.classify({"recovery": 25, "strain": 5, "sleepPerformance": 0.5, "hrv": 25, "heartRate": 55})
    assert len(changes) == 1
    assert changes[0][1] == "FATIGUED"


def test_no_data_defaults_relaxed():
    bio = _bio()
    assert bio.classify(None) == "RELAXED"


def test_personality_modifiers_deep_focus():
    bio = _bio()
    m = bio.get_personality_modifiers("DEEP_FOCUS")
    assert m["intervention_threshold"] >= 0.8
    assert m["max_tokens"] <= 50


def test_personality_modifiers_fatigued():
    bio = _bio()
    m = bio.get_personality_modifiers("FATIGUED")
    assert m["risk_sensitivity"] == "critical"
