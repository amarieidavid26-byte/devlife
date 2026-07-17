"""WHOOP scrie cheia cu None cand strapul nu are senzorul (spo2, skin temp), iar
build_biometric_msg o rotunjea direct. round(None) arunca TypeError, iar broadcast-ul
statea in afara oricarui try din biometric_loop -- firul e daemon, nu are supervizor si
nimic nu-l reporneste, deci un singur camp lipsa ingheta HUD-ul pana la restart.
"""

from runtime import build_biometric_msg


def test_null_sensor_fields_do_not_raise():
    """Regresie: `data.get("spo2", 0)` returneaza None cand cheia exista cu valoarea None
    -- default-ul din get() se aplica doar cand cheia lipseste."""
    data = {"heartRate": 60, "spo2": None, "skinTemp": None, "recovery": None, "hrv": None}

    msg = build_biometric_msg(data, "RELAXED")

    assert msg["spo2"] is None
    assert msg["skinTemp"] is None
    assert msg["recovery"] == 0


def test_real_sensor_values_are_still_rounded():
    data = {"heartRate": 60, "spo2": 97.46, "skinTemp": 33.21, "recovery": 74.6, "strain": 10.24}

    msg = build_biometric_msg(data, "RELAXED")

    assert msg["spo2"] == 97.5
    assert msg["skinTemp"] == 33.2
    assert msg["recovery"] == 75
    assert msg["strain"] == 10.2


def test_missing_keys_still_fall_back_to_neutral_numbers():
    msg = build_biometric_msg({"heartRate": 60}, "RELAXED")

    assert msg["recovery"] == 0
    assert msg["strain"] == 0
    assert msg["spo2"] is None


def test_biometric_loop_survives_a_failing_cycle():
    """Corpul buclei e prins intr-un try, ca in ghost_loop: un ciclu prost se sare, firul
    ramane viu. Fara asta, orice exceptie noua omoara biometria pentru toata sesiunea."""
    import inspect

    import loops

    src = inspect.getsource(loops.biometric_loop)
    body = src.split("while app_state.ghost_running:", 1)[1]

    assert body.lstrip().startswith("#") or body.lstrip().startswith("try:"), \
        "corpul buclei de biometrie nu mai e protejat"
    assert "try:" in body.split("is_whoop", 1)[0], \
        "try-ul trebuie sa cuprinda tot ciclul, nu doar o portiune"
    assert "except Exception" in body
