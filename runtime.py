"""Shared runtime state and singletons.

Everything that the loops (loops.py), the game WebSocket handlers (ws_game.py) and
the HTTP routes (server.py) have in common lives here: the AppState container, the
engine/brain/analyzer instances, and the broadcast helpers that marshal messages
from daemon threads onto the asyncio event loop.

server.py re-exports these names so tests can keep patching `server.<attr>`.
"""

import asyncio
import logging
import threading
import time
from dataclasses import dataclass, field

from config import (
    CLAUDE_API_KEY, WHOOP_CLIENT_ID, WHOOP_CLIENT_SECRET,
    GAME_MODE, DEMO_OFFLINE,
)

from content_analyzer import ContentAnalyzer
try:
    from screen_capture import ScreenCapture
    from vision_analyzer import VisionAnalyzer
    _DESKTOP_AVAILABLE = True
except ImportError:
    ScreenCapture = None
    VisionAnalyzer = None
    _DESKTOP_AVAILABLE = False

from biometric_engine import BiometricEngine
from mock_biometrics import MockBiometrics
from ghost_brain import GhostBrain
from context_history import ContextTracker
from inline_completer import InlineCompleter

logger = logging.getLogger(__name__)

# WS payload bounds, kept aligned with the Pydantic models in server.py so
# HTTP and WS share one input contract
WS_MAX_CONTENT_CHARS = 50000
WS_MAX_ACTION_CHARS = 100
WS_MAX_KWARG_CHARS = 500
WS_VALID_APP_TYPES = {"code", "terminal", "browser", "notes", "chat"}

# instances
content_analyzer = ContentAnalyzer(CLAUDE_API_KEY)
capture = ScreenCapture() if _DESKTOP_AVAILABLE else None
vision = VisionAnalyzer(CLAUDE_API_KEY) if _DESKTOP_AVAILABLE else None
bio = BiometricEngine(WHOOP_CLIENT_ID, WHOOP_CLIENT_SECRET)
mock = MockBiometrics(seeded=DEMO_OFFLINE)
brain = GhostBrain(CLAUDE_API_KEY)
tracker = ContextTracker()
inline_completer = InlineCompleter(CLAUDE_API_KEY)


def get_analyzer():
    return content_analyzer if GAME_MODE else vision


# personal calibration: baselines learned in past sessions are loaded at startup and
# persisted periodically, so the "relative to YOUR rhythm" logic doesn't restart from
# scratch (or from the hardcoded defaults) every run

def load_calibration():
    import persistence.db as db
    v = db.get_calibration("hrv_baseline")
    if v:
        bio.hrv_baseline = v
        bio._hrv_calibrated = True   # a real baseline exists; don't let the first poll snap over it
    v = db.get_calibration("baseline_hr")
    if v:
        app_state.baseline_hr = v
    v = db.get_calibration("typing_iki")
    if v:
        bio.keystrokes.baseline_iki = v
    v = db.get_calibration("typing_err")
    if v is not None:
        bio.keystrokes.baseline_err = v
    logger.info("calibration loaded: hrv=%.1f hr=%.0f typing_iki=%s",
                bio.hrv_baseline, app_state.baseline_hr, bio.keystrokes.baseline_iki)


def save_calibration():
    import persistence.db as db
    db.set_calibration("hrv_baseline", bio.hrv_baseline)
    db.set_calibration("baseline_hr", app_state.baseline_hr)
    if bio.keystrokes.baseline_iki is not None:
        db.set_calibration("typing_iki", bio.keystrokes.baseline_iki)
        db.set_calibration("typing_err", bio.keystrokes.baseline_err)


# in-app settings: API keys pasted in the dashboard override .env, live in the local
# SQLite only, and are re-applied to the already-constructed clients without a restart

SETTINGS_ENV_DEFAULTS = {
    "claude_api_key": CLAUDE_API_KEY,
    "whoop_client_id": WHOOP_CLIENT_ID,
    "whoop_client_secret": WHOOP_CLIENT_SECRET,
}

_effective_settings = dict(SETTINGS_ENV_DEFAULTS)


def effective_setting(key):
    return _effective_settings.get(key, "")


def setting_source(key):
    import persistence.db as db
    if db.get_setting(key):
        return "app"
    if SETTINGS_ENV_DEFAULTS.get(key):
        return "env"
    return None


def apply_settings():
    import persistence.db as db
    for key, env_val in SETTINGS_ENV_DEFAULTS.items():
        _effective_settings[key] = db.get_setting(key) or env_val

    claude_key = _effective_settings["claude_api_key"]
    content_analyzer.set_api_key(claude_key)
    brain.set_api_key(claude_key)
    inline_completer.set_api_key(claude_key)
    if vision:
        vision.set_api_key(claude_key)
    bio.client_id = _effective_settings["whoop_client_id"]
    bio.client_secret = _effective_settings["whoop_client_secret"]
    logger.info("settings applied: claude_key=%s whoop_creds=%s",
                "set" if claude_key else "missing",
                "set" if bio.client_id else "missing")


@dataclass
class AppState:
    connected_clients: list = field(default_factory=list)
    intervention_history: list = field(default_factory=list)
    mock_override_until: float = 0.0
    # manually-selected demo state (keys 1-5): locked label + when the lock expires. While
    # held, the loop broadcasts this state verbatim instead of re-classifying the (smoothly
    # transitioning) mock numbers, so the selection never jumps to a neighbouring state.
    forced_state: object = None
    forced_until: float = 0.0
    suppressed_hashes: dict = field(default_factory=dict)
    intervention_cooldown_until: float = 0.0
    last_intervention_hash: object = None
    sleep_mode_active: bool = False
    sleep_low_hr_count: int = 0
    # activitate manuala (miscare) care tine personajul treaz fara sa forteze o stare demo
    manual_awake_until: float = 0.0
    last_coding_activity: float = 0.0
    ghost_running: bool = False
    main_event_loop: object = None
    pending_content: dict = field(default_factory=dict)
    content_lock: threading.Lock = field(default_factory=threading.Lock)
    last_analyzed_hashes: dict = field(default_factory=dict)
    pending_patches: dict = field(default_factory=dict)  # hash -> original_text
    # recovery velocity
    hr_history: list = field(default_factory=list)
    last_stress_peak: object = None
    recovery_velocity: object = None
    baseline_hr: float = 68.0
    # last daily WHOOP HRV seen -- a change means a new morning summary landed,
    # which is when the personal HRV baseline learns (EMA), not every 5s cycle
    last_whoop_hrv: object = None
    # WHOOP REST polling is throttled off the 5s loop (see loops.biometric_loop): when to next
    # hit the API, and the current exponential backoff after a transient failure.
    next_whoop_poll: float = 0.0
    whoop_backoff: float = 0.0
    # True when we're serving the last-good WHOOP snapshot because a live fetch failed (API 5xx/
    # timeout): the UI shows a "stale" marker instead of treating it as a fresh reading, and we
    # never swap in the mock preset (which reads as a recovery/strain "spike").
    metrics_stale: bool = False


app_state = AppState()


async def broadcast(message: dict):
    dead = []
    for client in list(app_state.connected_clients):
        try:
            await client.send_json(message)
        except Exception:
            dead.append(client)
    for client in dead:
        if client in app_state.connected_clients:
            app_state.connected_clients.remove(client)


def broadcast_sync(message: dict):
    if app_state.main_event_loop is None:
        return
    try:
        asyncio.run_coroutine_threadsafe(broadcast(message), app_state.main_event_loop)
    except Exception:
        pass


def _degraded_banner(cause: str):
    broadcast_sync({"type": "degraded_mode", "cause": cause})


def _state_explanation(state):
    # classify() rebuilds bio.last_explanation for the state it decided. When a demo state is
    # forced (loops.py sets forced_state and skips classify), the stored breakdown is for a
    # different state, so emit an honest "manually set" stub instead of a stale one.
    exp = bio.last_explanation
    if not exp or exp.get("state") != state:
        return {"state": state, "signal": "forced", "reason_key": "demo_forced",
                "reason_vars": {}, "factors": []}
    return exp


def build_biometric_msg(data, state):
    ble_active = bio.live_heart_rate and (time.time() - bio.live_hr_timestamp < 5)
    source = "whoop" if bio.access_token and time.time() >= app_state.mock_override_until else "mock"
    # RMSSD computed live from BLE RR intervals wins over the daily WHOOP summary / mock
    live_hrv = bio.live_hrv if (time.time() - bio.live_hrv_timestamp < 30) else None

    if len(app_state.hr_history) >= 2:
        recent = app_state.hr_history[-1][1]
        prev   = app_state.hr_history[-2][1]
        hr_trend = "rising" if recent > prev + 1 else "falling" if recent < prev - 1 else "stable"
    else:
        hr_trend = "stable"

    return {
        "type": "biometric_update",
        "source": "ble" if ble_active else source,
        # where recovery/HRV/strain come from -- lets the HUD be honest in BLE-only mode
        "metrics_source": source,
        # last-good WHOOP snapshot served because the live fetch failed (API down): lets the HUD
        # show a stale marker rather than presenting it as a fresh reading
        "data_stale": app_state.metrics_stale,
        # sent every tick: a page reloaded after the OAuth redirect misses the one-shot
        # whoop_connected broadcast
        "whoop_connected": bio.access_token is not None,
        "heartRate": round(data["heartRate"]) if data.get("heartRate") else None,
        # `or 0`, nu `get(k, 0)`: WHOOP scrie cheia cu None cand strapul nu are senzorul,
        # iar default-ul din get() se aplica doar cand cheia lipseste -- round(None) arunca
        "recovery": round(data.get("recovery") or 0),
        "strain": round(data.get("strain") or 0, 1),
        "state": state,
        "sleepPerformance": round(data.get("sleepPerformance") or 0, 2),
        "hrv": live_hrv if live_hrv is not None else round(data.get("hrv") or 0, 1),
        "hrv_live": live_hrv is not None,
        # the stable WHOOP daily RMSSD, always -- kept separate from the overloaded `hrv` field
        # above (which carries the jumpy live BLE RMSSD when a strap streams) so composites and
        # trends can ride the steady value instead of spiking
        "hrv_daily": round(data.get("hrv") or 0, 1),
        # what classify() decided, incl. typing/HRV fusion
        "estimated_stress": round(bio.estimated_stress, 2),
        "spo2": round(data["spo2"], 1) if data.get("spo2") is not None else None,
        "skinTemp": round(data["skinTemp"], 1) if data.get("skinTemp") is not None else None,
        # real resting HR (distinct from the live BLE pulse) + real sleep breakdown; null when
        # WHOOP hasn't scored them yet so the UI can honestly show "--" instead of a fake number.
        "restingHeartRate": round(data["restingHeartRate"]) if data.get("restingHeartRate") else None,
        "sleepHours": data.get("sleepHours"),
        "sleepScore": data.get("sleepScore"),
        "sleepEfficiency": round(data["sleepEfficiency"]) if data.get("sleepEfficiency") is not None else None,
        "sleepConsistency": round(data["sleepConsistency"]) if data.get("sleepConsistency") is not None else None,
        "sleepRemPct": data.get("sleepRemPct"),
        "sleepDeepPct": data.get("sleepDeepPct"),
        "respiratoryRate": round(data["respiratoryRate"], 1) if data.get("respiratoryRate") is not None else None,
        "recovery_velocity": round(app_state.recovery_velocity, 1) if app_state.recovery_velocity is not None else None,
        "baseline_hr": round(app_state.baseline_hr),
        "hr_trend": hr_trend,
        # typing rhythm signal (keystroke_dynamics.py) -- active means enough recent
        # keystrokes to estimate stress/fatigue from cadence alone
        "typing": bio.keystrokes.snapshot(),
        # "why this state": the factors + decisive reason classify() used, so the HUD can
        # show that the classification is our own deterministic logic (not the LLM ghost)
        "state_explanation": _state_explanation(state),
    }


def on_state_change(old_state, new_state):
    data = mock.get_data() if (not bio.access_token or time.time() < app_state.mock_override_until) else bio.current_data or {}
    reason = "Biometric data changed"
    if data.get("strain", 0) > 16:
        reason = "Strain over 16"
    elif data.get("recovery", 100) < 40:
        reason = "Recovery dropped below 40"
    elif data.get("sleepPerformance", 1) < 0.7:
        reason = "Poor sleep performance"

    broadcast_sync({
        "type": "state_change",
        "from": old_state,
        "to": new_state,
        "reason": reason,
        "estimated_stress": bio.estimated_stress,
    })
    if not GAME_MODE and capture:
        modifiers = bio.get_personality_modifiers(new_state)
        capture.set_interval(modifiers.get("capture_interval", 3))


bio.on_state_change(on_state_change)
