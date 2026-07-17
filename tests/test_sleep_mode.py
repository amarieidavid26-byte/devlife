"""Sleep mode se declanseaza cand banda BLE nu mai transmite (scoasa de pe incheietura).
Bug-ul: cand banda se DECONECTEAZA de tot (scoasa din priza, sau un refresh rupe legatura
BLE), nu mai vine niciun puls live, deci ramura de trezire -- care cere puls >= 50 -- nu se
mai atinge niciodata, iar personajul ramanea adormit fara scapare pana la restart.

Controlul manual (tastele 1-5, care seteaza mock_override_until) trebuie sa fie o iesire:
un semnal explicit "sunt treaz", care castiga peste deductia de banda-scoasa.
"""

import time

from loops import _check_sleep_mode
from runtime import app_state, bio


def _reset():
    app_state.sleep_mode_active = False
    app_state.sleep_low_hr_count = 0
    app_state.mock_override_until = 0.0
    app_state.manual_awake_until = 0.0
    bio.live_heart_rate = 0
    bio.live_hr_timestamp = 0
    # nu lasa broadcast_sync sa incerce reteaua in test
    app_state.main_event_loop = None


def test_band_disconnected_then_manual_control_wakes(monkeypatch):
    _reset()
    now = time.time()
    # banda a transmis candva, apoi a tacut mult peste fereastra de gratie -> off wrist
    bio.live_hr_timestamp = now - 999
    bio.live_heart_rate = 0

    _check_sleep_mode({})
    assert app_state.sleep_mode_active is True, "banda tacuta trebuie sa adoarma personajul"

    # fara puls live, tick dupa tick, personajul NU se poate trezi singur -- de aici bug-ul
    for _ in range(5):
        _check_sleep_mode({})
    assert app_state.sleep_mode_active is True, "confirma capcana: fara puls nu exista trezire"

    # utilizatorul apasa o tasta de stare -> mock_override_until in viitor
    app_state.mock_override_until = time.time() + 3600
    _check_sleep_mode({})
    assert app_state.sleep_mode_active is False, "controlul manual trebuie sa trezeasca"

    # si nu re-adoarme cat timp controlul manual e activ
    _check_sleep_mode({})
    assert app_state.sleep_mode_active is False, "nu are voie sa re-adoarma sub control manual"


def test_manual_override_expiry_lets_sleep_resume(monkeypatch):
    _reset()
    now = time.time()
    bio.live_hr_timestamp = now - 999
    app_state.mock_override_until = now - 1     # override expirat
    _check_sleep_mode({})
    assert app_state.sleep_mode_active is True, "dupa expirarea controlului manual, off-wrist adoarme din nou"


def test_movement_activity_wakes_without_forcing_a_state():
    """Miscarea (manual_awake_until) trebuie sa trezeasca la fel ca tastele 1-5, dar fara sa
    forteze o stare demo -- mock_override_until ramane 0."""
    _reset()
    now = time.time()
    bio.live_hr_timestamp = now - 999
    _check_sleep_mode({})
    assert app_state.sleep_mode_active is True

    app_state.manual_awake_until = time.time() + 120     # ce seteaza _ws_wake
    _check_sleep_mode({})
    assert app_state.sleep_mode_active is False, "miscarea trebuie sa trezeasca"
    assert app_state.mock_override_until == 0.0, "miscarea nu are voie sa forteze o stare demo"


def test_activity_wake_expires_and_sleep_resumes():
    _reset()
    now = time.time()
    bio.live_hr_timestamp = now - 999
    app_state.manual_awake_until = now - 1               # activitate expirata
    _check_sleep_mode({})
    assert app_state.sleep_mode_active is True, "dupa ce activitatea se opreste, off-wrist adoarme din nou"


def test_live_pulse_still_wakes_normally():
    _reset()
    now = time.time()
    app_state.sleep_mode_active = True
    bio.live_hr_timestamp = now
    bio.live_heart_rate = 68          # puls sanatos, banda pe incheietura
    _check_sleep_mode({})
    assert app_state.sleep_mode_active is False, "un puls live normal trebuie sa trezeasca (calea existenta)"
