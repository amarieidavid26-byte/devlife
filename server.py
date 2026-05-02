import asyncio
import json
import logging
import os
import time
import threading
import random
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from typing import Optional
from pydantic import BaseModel, Field

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse, RedirectResponse
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from config import (
    CLAUDE_API_KEY, WHOOP_CLIENT_ID, WHOOP_CLIENT_SECRET,
    HOST, PORT as _CONFIG_PORT,
    GAME_MODE, CONTENT_REANALYZE_INTERVAL, CONTENT_MIN_LENGTH,
    WHOOP_REDIRECT_URI, ALLOWED_ORIGINS, DEMO_OFFLINE,
)

logger = logging.getLogger(__name__)

limiter = Limiter(key_func=get_remote_address)


class MockStateBody(BaseModel):
    state: int = Field(..., ge=1, le=5)


class FeedbackBody(BaseModel):
    action: str = Field(..., max_length=100)

PORT = int(os.environ.get("PORT", _CONFIG_PORT))

# import both module sets unconditionally — route at runtime, not import time
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
from fallback_responses import get_fallback_intervention
import persistence.db as db
from apply_fix.contract import PatchContract
from apply_fix.validator import validate_patch
from apply_fix.audit import make_patch_hash, record as audit_record

# instances
content_analyzer = ContentAnalyzer(CLAUDE_API_KEY)
capture = ScreenCapture() if _DESKTOP_AVAILABLE else None
vision = VisionAnalyzer(CLAUDE_API_KEY) if _DESKTOP_AVAILABLE else None
bio = BiometricEngine(WHOOP_CLIENT_ID, WHOOP_CLIENT_SECRET)
mock = MockBiometrics(seeded=DEMO_OFFLINE)
brain = GhostBrain(CLAUDE_API_KEY)
tracker = ContextTracker()


def get_analyzer():
    return content_analyzer if GAME_MODE else vision


def _degraded_banner(cause: str):
    broadcast_sync({"type": "degraded_mode", "cause": cause})


@dataclass
class AppState:
    connected_clients: list = field(default_factory=list)
    intervention_history: list = field(default_factory=list)
    mock_override_until: float = 0.0
    suppressed_hashes: dict = field(default_factory=dict)
    intervention_cooldown_until: float = 0.0
    last_intervention_hash: object = None
    sleep_mode_active: bool = False
    sleep_low_hr_count: int = 0
    ble_disconnected: bool = False
    ble_disconnected_timer: object = None
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
    sim_hr: float = 67.0

app_state = AppState()

_SIM_HR_RANGES = {
    "RELAXED":    (62, 72),
    "DEEP_FOCUS": (65, 78),
    "STRESSED":   (85, 100),
    "FATIGUED":   (55, 65),
    "WIRED":      (80, 95),
}


async def broadcast(message: dict):
    dead = []
    for client in app_state.connected_clients:
        try:
            await client.send_json(message)
        except Exception:
            dead.append(client)
    for client in dead:
        app_state.connected_clients.remove(client)


def broadcast_sync(message: dict):
    if app_state.main_event_loop is None:
        return
    asyncio.run_coroutine_threadsafe(broadcast(message), app_state.main_event_loop)


def build_biometric_msg(data, state):
    ble_active = bio.live_heart_rate and (time.time() - bio.live_hr_timestamp < 5)
    source = "whoop" if bio.access_token and time.time() >= app_state.mock_override_until else "mock"

    if len(app_state.hr_history) >= 2:
        recent = app_state.hr_history[-1][1]
        prev   = app_state.hr_history[-2][1]
        hr_trend = "rising" if recent > prev + 1 else "falling" if recent < prev - 1 else "stable"
    else:
        hr_trend = "stable"

    return {
        "type": "biometric_update",
        "source": "ble" if ble_active else source,
        "heartRate": round(data.get("heartRate", 0)),
        "recovery": round(data.get("recovery", 0)),
        "strain": round(data.get("strain", 0), 1),
        "state": state,
        "sleepPerformance": round(data.get("sleepPerformance", 0), 2),
        "hrv": round(data.get("hrv", 0), 1),
        "estimated_stress": round(data.get("estimated_stress", 0), 2),
        "spo2": round(data.get("spo2", 0), 1),
        "skinTemp": round(data.get("skinTemp", 0), 1),
        "recovery_velocity": round(app_state.recovery_velocity, 1) if app_state.recovery_velocity is not None else None,
        "baseline_hr": round(app_state.baseline_hr),
        "hr_trend": hr_trend,
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


def _simulate_hr(state):
    lo, hi = _SIM_HR_RANGES.get(state, (62, 72))
    mid = (lo + hi) / 2
    app_state.sim_hr += (mid - app_state.sim_hr) * 0.15 + random.uniform(-3, 3)
    app_state.sim_hr = max(lo, min(hi, app_state.sim_hr))
    return round(app_state.sim_hr)


def _update_baseline(new_avg):
    app_state.baseline_hr += (new_avg - app_state.baseline_hr) * 0.1


def _mark_stress_peak():
    app_state.last_stress_peak = time.time()


def _mark_recovery():
    app_state.recovery_velocity = time.time() - app_state.last_stress_peak
    app_state.last_stress_peak = None


def _on_ble_disconnect_timeout():
    if app_state.ble_disconnected and not app_state.sleep_mode_active:
        app_state.sleep_mode_active = True
        broadcast_sync({"type": "sleep_mode", "active": True})
        logger.info("sleep mode on -- ble disconnected")


def _check_sleep_mode(data):
    if app_state.ble_disconnected:
        return

    ble_fresh = bio.live_heart_rate >= 0 and (time.time() - bio.live_hr_timestamp < 10)
    if not ble_fresh:
        if app_state.sleep_mode_active:
            app_state.sleep_mode_active = False
            app_state.sleep_low_hr_count = 0
            broadcast_sync({"type": "sleep_mode", "active": False})
            logger.info("sleep mode off -- no ble data")
        return

    hr = bio.live_heart_rate
    if hr < 50:
        app_state.sleep_low_hr_count += 1
        if app_state.sleep_low_hr_count >= 5 and not app_state.sleep_mode_active:
            app_state.sleep_mode_active = True
            broadcast_sync({"type": "sleep_mode", "active": True})
            logger.info("sleep mode on -- low HR=%s for %d cycles", hr, app_state.sleep_low_hr_count)
    else:
        if app_state.sleep_mode_active:
            app_state.sleep_mode_active = False
            broadcast_sync({"type": "sleep_mode", "active": False})
            logger.info("sleep mode off, HR=%s", hr)


def biometric_loop():
    while app_state.ghost_running:
        is_whoop = False
        if DEMO_OFFLINE or time.time() < app_state.mock_override_until:
            data = mock.get_data()
        elif bio.access_token:
            data = bio.fetch_data()
            if data is None:
                data = mock.get_data()
                _degraded_banner("WHOOP API unavailable")
            else:
                is_whoop = True
        else:
            data = mock.get_data()

        if data:
            ble_fresh = bio.live_heart_rate and (time.time() - bio.live_hr_timestamp < 5)
            if ble_fresh:
                data["heartRate"] = bio.live_heart_rate
            elif is_whoop:
                pre_state = bio.classify(data)
                data["heartRate"] = _simulate_hr(pre_state)
            state = bio.classify(data)

            hr = data.get("heartRate", 0)
            if hr > 0:
                app_state.hr_history.append((time.time(), hr))
                if len(app_state.hr_history) > 120:
                    del app_state.hr_history[:-120]

                if len(app_state.hr_history) >= 5:
                    sorted_hrs = sorted(h for _, h in app_state.hr_history)
                    low_count = max(1, len(sorted_hrs) // 5)
                    _update_baseline(sum(sorted_hrs[:low_count]) / low_count)

                if hr > app_state.baseline_hr + 20 and app_state.last_stress_peak is None:
                    _mark_stress_peak()
                if app_state.last_stress_peak is not None and hr < app_state.baseline_hr + 5:
                    _mark_recovery()

            if is_whoop:
                src = "ble" if ble_fresh else "whoop"
                logger.info("WHOOP state=%s rec=%s strain=%s hrv=%s hr=%s src=%s", state, data.get("recovery"), data.get("strain"), data.get("hrv"), data.get("heartRate"), src)

            broadcast_sync(build_biometric_msg(data, state))

        _check_sleep_mode(data)
        if app_state.last_coding_activity > 0 and time.time() - app_state.last_coding_activity > 60:
            app_state.last_coding_activity = time.time()
            broadcast_sync({"type": "plant_update", "delta": -2})

        time.sleep(5)


def ghost_loop():
    time.sleep(2)
    while app_state.ghost_running:
        try:
            state = bio.current_state
            modifiers = bio.get_personality_modifiers(state)

            if GAME_MODE:
                analysis = None
                app_type = None
                content_data = None
                content_hash = None

                with app_state.content_lock:
                    latest_time = 0
                    for atype, d in app_state.pending_content.items():
                        if d["timestamp"] > latest_time:
                            latest_time = d["timestamp"]
                            app_type = atype
                            content_data = d

                if content_data and len(content_data.get("content", "")) >= CONTENT_MIN_LENGTH:
                    content_hash = hash(content_data["content"][:500])
                    already_analyzed = content_hash == app_state.last_analyzed_hashes.get(app_type)
                    in_cooldown      = time.time() < app_state.intervention_cooldown_until
                    user_suppressed  = app_state.suppressed_hashes.get(content_hash, 0) > time.time()

                    if already_analyzed or in_cooldown or user_suppressed:
                        with app_state.content_lock:
                            app_state.pending_content.pop(app_type, None)
                    else:
                        context_summary = tracker.get_summary()
                        try:
                            analysis = content_analyzer.analyze(
                                app_type=app_type,
                                content=content_data["content"],
                                extra_context=context_summary or "",
                                **content_data.get("kwargs", {}),
                            )
                            app_state.last_analyzed_hashes[app_type] = content_hash
                            with app_state.content_lock:
                                app_state.pending_content.pop(app_type, None)
                        except Exception as e:
                            logger.warning("content analysis failed: %s", e)

                if analysis:
                    tracker.update(analysis, state, bio.estimated_stress)
                    intervention = brain.process(analysis, state, modifiers)

                    if intervention:
                        app_state.intervention_cooldown_until = time.time() + 8
                        app_state.last_intervention_hash = content_hash
                        app_state.last_analyzed_hashes.clear()
                        bio_data = mock.get_data() if (not bio.access_token or time.time() < app_state.mock_override_until) else (bio.current_data or {})
                        intervention["biometric"] = build_biometric_msg(bio_data, state)
                        intervention["app_type"] = app_type
                        broadcast_sync(intervention)
                        app_state.intervention_history.append(intervention)
                        if len(app_state.intervention_history) > 50:
                            app_state.intervention_history.pop(0)
                        db.save_intervention(
                            state=state,
                            source=app_type or "game",
                            claude_text=intervention["message"],
                            content_hash=str(content_hash) if content_hash else None,
                        )
                        logger.info("intervention (%s/%s): %s...", state, app_type, intervention["message"][:80])
                        plant_delta = -25 if intervention.get("priority") == "critical" else -15
                        broadcast_sync({"type": "plant_update", "delta": plant_delta})
                    else:
                        broadcast_sync({"type": "plant_update", "delta": 10})

            else:
                if not capture:
                    time.sleep(1)
                    continue
                screenshots = capture.get_buffer()
                if not screenshots:
                    time.sleep(1)
                    continue

                context_summary = tracker.get_summary()
                try:
                    analysis = vision.analyze(screenshots, context_summary)
                except Exception as e:
                    logger.warning("vision analysis failed: %s", e)
                    time.sleep(modifiers.get("capture_interval", 3))
                    continue

                tracker.update(analysis, state, bio.estimated_stress)
                intervention = brain.process(analysis, state, modifiers)

                if intervention:
                    bio_data = mock.get_data() if (not bio.access_token or time.time() < app_state.mock_override_until) else (bio.current_data or {})
                    intervention["biometric"] = build_biometric_msg(bio_data, state)
                    broadcast_sync(intervention)
                    app_state.intervention_history.append(intervention)
                    if len(app_state.intervention_history) > 50:
                        app_state.intervention_history.pop(0)
                    logger.info("intervention (%s): %s...", state, intervention["message"][:80])

        except Exception as e:
            logger.error("ghost_loop error: %s", e)
            import traceback
            traceback.print_exc()
        time.sleep(1)


@asynccontextmanager
async def lifespan(app: FastAPI):
    app_state.ghost_running = True
    app_state.main_event_loop = asyncio.get_event_loop()

    db.connect()
    db.start_session(
        mode="game" if GAME_MODE else "desktop",
        whoop_connected=bool(bio.access_token),
    )

    if DEMO_OFFLINE:
        logger.info("DEMO_OFFLINE active -- all external calls mocked")
        # broadcast after event loop is ready, give frontend time to connect
        async def _send_degraded():
            await asyncio.sleep(2)
            broadcast_sync({"type": "degraded_mode", "cause": "demo-offline"})
        asyncio.ensure_future(_send_degraded())

    if not GAME_MODE and capture:
        capture.start()
        logger.info("screen capture started")
    else:
        logger.info("game mode -- waiting for content")

    bio_thread   = threading.Thread(target=biometric_loop, daemon=True)
    ghost_thread = threading.Thread(target=ghost_loop,     daemon=True)
    bio_thread.start()
    ghost_thread.start()
    logger.info("running on http://%s:%s", HOST, PORT)
    yield

    db.end_session()
    app_state.ghost_running = False
    if not GAME_MODE and capture:
        capture.stop()
    app_state.main_event_loop = None
    logger.info("shutdown")


app = FastAPI(title="DevLife Backend", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, lambda req, exc: JSONResponse(
    status_code=429, content={"error": "too many requests"}
))

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/public", StaticFiles(directory="public"), name="public")


@app.get("/health")
async def health():
    return {"status": "alive", "ghost": "watching"}


@app.get("/ready")
async def ready():
    reasons = []
    if not CLAUDE_API_KEY and not DEMO_OFFLINE:
        reasons.append("CLAUDE_API_KEY missing")
    try:
        from persistence.db import connect
        connect()
    except Exception as e:
        reasons.append(f"db not ready: {e}")
    if reasons:
        return JSONResponse(status_code=503, content={"ready": False, "reasons": reasons})
    return {"ready": True, "demo_offline": DEMO_OFFLINE, "game_mode": GAME_MODE}


@app.get("/api/status")
async def status():
    bio_data = mock.get_data() if (not bio.access_token or time.time() < app_state.mock_override_until) else (bio.current_data or {})
    analyzer = get_analyzer()
    return {
        "biometric_state": bio.current_state,
        "biometric_data": bio_data,
        "last_analysis": analyzer.last_analysis if analyzer else None,
        "interventions_total": brain.intervention_count,
        "interventions_accepted": brain.accepted_count,
        "interventions_ignored": brain.ignored_count,
        "session_stats": tracker.get_session_stats(),
        "mock_mode": not bio.access_token or time.time() < app_state.mock_override_until,
        "whoop_connected": bio.access_token is not None,
        "estimated_stress": bio.estimated_stress,
        "hrv_baseline": bio.hrv_baseline,
        "hrv_current": bio_data.get("hrv", 0),
        "game_mode": GAME_MODE,
        "current_app": analyzer.last_analysis.get("app") if GAME_MODE and analyzer and analyzer.last_analysis else None,
    }


@app.post("/api/biometric/mock")
@limiter.limit("30/minute")
async def set_mock_state(request: Request, body: MockStateBody):
    mock.set_state(body.state)
    await asyncio.sleep(0.3)
    data = mock.get_data()
    new_state = bio.classify(data)
    return {"ok": True, "preset": body.state, "state": new_state, "data": data}


@app.post("/api/feedback")
async def user_feedback(body: FeedbackBody):
    brain.user_feedback(body.action)
    return {"ok": True, "accepted": brain.accepted_count, "ignored": brain.ignored_count}


class PatchHashBody(BaseModel):
    patch_hash: str = Field(..., max_length=64)


@app.post("/api/apply-fix/preview")
async def apply_fix_preview(body: PatchContract):
    try:
        ok, reason = validate_patch(body)
    except Exception as e:
        return JSONResponse(status_code=400, content={"valid": False, "reason": str(e)})
    if not ok:
        audit_record("reject", "?", file=body.file, original_text=body.original_text, reason=reason)
        return JSONResponse(status_code=400, content={"valid": False, "reason": reason})
    patch_hash = make_patch_hash(body.original_text, body.replacement_text)
    app_state.pending_patches[patch_hash] = body.original_text
    audit_record("preview", patch_hash, file=body.file, original_text=body.original_text)
    return {"valid": True, "patch_hash": patch_hash}


@app.post("/api/apply-fix/confirm")
async def apply_fix_confirm(body: PatchHashBody):
    if body.patch_hash not in app_state.pending_patches:
        return JSONResponse(status_code=404, content={"error": "patch not found or expired"})
    audit_record("confirm", body.patch_hash)
    return {"ok": True}


@app.post("/api/apply-fix/rollback")
async def apply_fix_rollback(body: PatchHashBody):
    original = app_state.pending_patches.get(body.patch_hash)
    if original is None:
        return JSONResponse(status_code=404, content={"error": "no pre-image stored for this patch"})
    audit_record("rollback", body.patch_hash)
    del app_state.pending_patches[body.patch_hash]
    return {"ok": True, "original_text": original}


@app.get("/api/history")
async def get_history(since: float = 0.0, limit: int = 50):
    rows = db.get_interventions(since=since, limit=min(limit, 200))
    if not rows:
        rows = app_state.intervention_history[-limit:]
    return {"interventions": rows}


@app.get("/api/game/apps")
async def get_game_apps():
    return {
        "game_mode": GAME_MODE,
        "apps": {
            "code":     {"room_object": "desk_computer",   "label": "Code Editor"},
            "terminal": {"room_object": "desk_terminal",   "label": "Terminal"},
            "browser":  {"room_object": "second_monitor",  "label": "Browser"},
            "notes":    {"room_object": "whiteboard",      "label": "Notes"},
            "chat":     {"room_object": "phone",           "label": "Chat"},
        },
    }


@app.get("/api/whoop/auth")
async def whoop_auth():
    auth_url = bio.get_auth_url(WHOOP_REDIRECT_URI)
    return RedirectResponse(url=auth_url)


@app.get("/api/whoop/callback")
async def whoop_callback(code: str = None, error: str = None):
    if error or not code:
        return JSONResponse({"error": error or "No code received"}, status_code=400)
    success = bio.exchange_token(code, WHOOP_REDIRECT_URI)
    if success:
        return RedirectResponse(url="http://localhost:5173")
    return JSONResponse({"error": "Token exchange failed"}, status_code=500)


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    app_state.connected_clients.append(ws)
    logger.info("ws client connected (%d total)", len(app_state.connected_clients))

    bio_data = mock.get_data() if (not bio.access_token or time.time() < app_state.mock_override_until) else (bio.current_data or {})
    await ws.send_json(build_biometric_msg(bio_data, bio.current_state))

    try:
        while True:
            raw = await ws.receive_text()
            try:
                data = json.loads(raw)
            except (json.JSONDecodeError, TypeError):
                continue
            if not isinstance(data, dict):
                continue

            if data.get("type") == "feedback":
                action = data.get("action", "")
                brain.user_feedback(action)
                if action == "Apply Fix":
                    app_state.intervention_cooldown_until = 0
                    app_state.last_analyzed_hashes.clear()
                    app_state.suppressed_hashes.clear()
                else:
                    if app_state.last_intervention_hash is not None:
                        app_state.suppressed_hashes[app_state.last_intervention_hash] = time.time() + 10
                        now = time.time()
                        app_state.suppressed_hashes = {h: t for h, t in app_state.suppressed_hashes.items() if t > now}

            elif data.get("type") == "content_update":
                app_type = data.get("app_type", "code")
                kwargs = {}
                for key in ("language", "cursor_line", "url", "shell", "platform"):
                    if data.get(key):
                        kwargs[key] = data[key]
                with app_state.content_lock:
                    app_state.pending_content[app_type] = {
                        "content": data.get("content", ""),
                        "timestamp": time.time(),
                        "changed": True,
                        "kwargs": kwargs,
                    }

            elif data.get("type") == "mock_state":
                state_num = data.get("state")
                if state_num in [1, 2, 3, 4, 5]:
                    mock.set_state(state_num)
                    data_now = mock.get_data()
                    new_state = bio.classify(data_now)
                    await ws.send_json(build_biometric_msg(data_now, new_state))
                    app_state.intervention_cooldown_until = 0
                    app_state.last_analyzed_hashes.clear()
                    app_state.suppressed_hashes.clear()
                    brain.last_intervention_time = 0

            elif data.get("type") == "app_focus":
                app_type = data.get("app_type")
                if app_type:
                    broadcast_sync({
                        "type": "app_focus_change",
                        "app_type": app_type,
                        "timestamp": time.time(),
                    })

    except WebSocketDisconnect:
        if ws in app_state.connected_clients:
            app_state.connected_clients.remove(ws)
        logger.info("ws client offline (%d total)", len(app_state.connected_clients))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=HOST, port=PORT)
