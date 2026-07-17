"""Personal calibration: baselines persisted in SQLite survive restarts."""

from persistence import db
import runtime


def _fresh_db(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "get_db_path", lambda: str(tmp_path / "t.db"))
    db.reset()
    db._current_session_id = None


def test_calibration_roundtrip(tmp_path, monkeypatch):
    _fresh_db(tmp_path, monkeypatch)
    assert db.get_calibration("typing_iki") is None
    assert db.get_calibration("typing_iki", 200.0) == 200.0
    db.set_calibration("typing_iki", 185.5)
    assert db.get_calibration("typing_iki") == 185.5
    db.set_calibration("typing_iki", 190.0)
    assert db.get_calibration("typing_iki") == 190.0


def test_save_then_load_restores_baselines(tmp_path, monkeypatch):
    _fresh_db(tmp_path, monkeypatch)
    bio = runtime.bio
    orig = (bio.hrv_baseline, runtime.app_state.baseline_hr,
            bio.keystrokes.baseline_iki, bio.keystrokes.baseline_err)
    try:
        bio.hrv_baseline = 62.0
        runtime.app_state.baseline_hr = 61.0
        bio.keystrokes.baseline_iki = 175.0
        bio.keystrokes.baseline_err = 0.03
        runtime.save_calibration()

        # simulate a restart: hardcoded defaults come back, then load restores
        bio.hrv_baseline = 50.0
        runtime.app_state.baseline_hr = 68.0
        bio.keystrokes.baseline_iki = None
        bio.keystrokes.baseline_err = None
        runtime.load_calibration()

        assert bio.hrv_baseline == 62.0
        assert runtime.app_state.baseline_hr == 61.0
        assert bio.keystrokes.baseline_iki == 175.0
        assert bio.keystrokes.baseline_err == 0.03
    finally:
        (bio.hrv_baseline, runtime.app_state.baseline_hr,
         bio.keystrokes.baseline_iki, bio.keystrokes.baseline_err) = orig


def test_load_without_saved_values_keeps_defaults(tmp_path, monkeypatch):
    _fresh_db(tmp_path, monkeypatch)
    bio = runtime.bio
    orig = (bio.hrv_baseline, runtime.app_state.baseline_hr,
            bio.keystrokes.baseline_iki, bio.keystrokes.baseline_err)
    try:
        bio.hrv_baseline = 50.0
        runtime.app_state.baseline_hr = 68.0
        bio.keystrokes.baseline_iki = None
        bio.keystrokes.baseline_err = None
        runtime.load_calibration()
        assert bio.hrv_baseline == 50.0
        assert runtime.app_state.baseline_hr == 68.0
        assert bio.keystrokes.baseline_iki is None
    finally:
        (bio.hrv_baseline, runtime.app_state.baseline_hr,
         bio.keystrokes.baseline_iki, bio.keystrokes.baseline_err) = orig
