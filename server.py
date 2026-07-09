import asyncio
import json
import logging
import os
import time
import threading
import random
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional
from pydantic import BaseModel, Field

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect, Header, HTTPException, Depends
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
    WORKSPACE_ROOT, TERMINAL_ENABLED, FILES_ENABLED, LSP_ENABLED, INLINE_AI_ENABLED,
    CODE_SERVER_ENABLED, WHOOP_OFF_GRACE_SECONDS, DEMO_STATE_HOLD_SECONDS,
)

import security
import terminal_pty
import file_api
import lsp_bridge
import code_server
from inline_completer import InlineCompleter

logger = logging.getLogger(__name__)

limiter = Limiter(key_func=get_remote_address)


class MockStateBody(BaseModel):
    state: int = Field(..., ge=1, le=5)


class FeedbackBody(BaseModel):
    action: str = Field(..., max_length=100)


# WS payload bounds — keep these aligned with the Pydantic models above so HTTP and WS
# share the same input contract. Without these a malicious or buggy client could
# blow up memory or run up Claude token costs.
WS_MAX_CONTENT_CHARS = 50000
WS_MAX_ACTION_CHARS = 100
WS_MAX_KWARG_CHARS = 500
WS_VALID_APP_TYPES = {"code", "terminal", "browser", "notes", "chat"}

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
inline_completer = InlineCompleter(CLAUDE_API_KEY)


def get_analyzer():
    return content_analyzer if GAME_MODE else vision


def _degraded_banner(cause: str):
    broadcast_sync({"type": "degraded_mode", "cause": cause})


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
        # where recovery/HRV/strain come from -- lets the HUD be honest in BLE-only mode
        "metrics_source": source,
        "heartRate": round(data["heartRate"]) if data.get("heartRate") else None,
        "recovery": round(data.get("recovery", 0)),
        "strain": round(data.get("strain", 0), 1),
        "state": state,
        "sleepPerformance": round(data.get("sleepPerformance", 0), 2),
        "hrv": round(data.get("hrv", 0), 1),
        "estimated_stress": round(data.get("estimated_stress", 0), 2),
        "spo2": round(data.get("spo2", 0), 1),
        "skinTemp": round(data.get("skinTemp", 0), 1),
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


def _update_baseline(new_avg):
    app_state.baseline_hr += (new_avg - app_state.baseline_hr) * 0.1


def _mark_stress_peak():
    app_state.last_stress_peak = time.time()


def _mark_recovery():
    app_state.recovery_velocity = time.time() - app_state.last_stress_peak
    app_state.last_stress_peak = None


def _set_sleep_mode(active, reason):
    if app_state.sleep_mode_active == active:
        return
    app_state.sleep_mode_active = active
    broadcast_sync({"type": "sleep_mode", "active": active, "reason": reason})
    logger.info("sleep mode %s -- %s", "on" if active else "off", reason)


def _check_sleep_mode(data):
    # Wear is inferred from the live BLE pulse only. We never look at the WHOOP API resting
    # HR here -- that value persists for hours after the band is removed, so it can't tell us
    # whether the band is on the wrist right now.
    now = time.time()
    had_ble = bio.live_hr_timestamp > 0          # the band has streamed at least once this session
    age = now - bio.live_hr_timestamp
    ble_fresh = bio.live_heart_rate > 0 and age < 5

    # Never paired a band (pure WHOOP-API mode): no live pulse to reason about, leave as-is.
    if not had_ble:
        return

    # Band streamed a pulse and then went silent past the grace window -> taken off the wrist.
    if not ble_fresh and age >= WHOOP_OFF_GRACE_SECONDS:
        app_state.sleep_low_hr_count = 0
        _set_sleep_mode(True, "WHOOP off wrist (no live HR for %ds)" % int(age))
        return

    # Within the grace window after a dropout: hold the current state, don't flip yet.
    if not ble_fresh:
        return

    # Live pulse is flowing -> band is worn. Sleep only on a genuinely low resting pulse
    # (user actually dozing off), and wake as soon as it climbs back.
    hr = bio.live_heart_rate
    if hr < 50:
        app_state.sleep_low_hr_count += 1
        if app_state.sleep_low_hr_count >= 5:
            _set_sleep_mode(True, "low HR=%s for %d cycles" % (hr, app_state.sleep_low_hr_count))
    else:
        app_state.sleep_low_hr_count = 0
        _set_sleep_mode(False, "HR=%s" % hr)


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
            elif bio.live_hr_timestamp > 0:
                # a band streamed a live pulse and it stopped -> WHOOP is off the wrist. Don't
                # pass the API resting HR off as a live heartbeat; null it so the HUD honestly
                # shows "--" and the character can fall asleep (see _check_sleep_mode).
                data["heartRate"] = None
            # else: pure WHOOP-API mode (no band ever paired) -> keep the real resting HR from
            # fetch_data. We never synthesize a fake live pulse.
            if app_state.forced_state and time.time() < app_state.forced_until:
                # A demo state is locked (keys 1-5). Hold it verbatim -- don't re-classify the
                # transitioning mock numbers, which would briefly read as neighbouring states.
                state = app_state.forced_state
                bio.current_state = state
                bio.estimated_stress = data.get("estimated_stress", bio.estimated_stress)
            else:
                state = bio.classify(data)

            hr = data.get("heartRate") or 0
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
                    content_hash = hash(content_data["content"])
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
                            logger.warning("content analysis failed: %s -- fallback ghost line", e)
                            app_state.last_analyzed_hashes[app_type] = content_hash
                            with app_state.content_lock:
                                app_state.pending_content.pop(app_type, None)
                            fb = get_fallback_intervention(state, brain.lang)
                            bio_data = mock.get_data() if (not bio.access_token or time.time() < app_state.mock_override_until) else (bio.current_data or {})
                            fb["biometric"] = build_biometric_msg(bio_data, state)
                            fb["app_type"] = app_type
                            app_state.intervention_cooldown_until = time.time() + 8
                            broadcast_sync(fb)

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


@app.get("/api/session")
async def get_session():
    """Per-process token for the privileged local endpoints. CORS keeps this response
    unreadable cross-origin, so a malicious site can never obtain the token."""
    return {
        "token": security.SESSION_TOKEN,
        "features": {
            "terminal": TERMINAL_ENABLED,
            "files": FILES_ENABLED,
            "lsp": LSP_ENABLED,
            "inline_ai": INLINE_AI_ENABLED,
            "code_server": CODE_SERVER_ENABLED,
        },
        "workspace_root": WORKSPACE_ROOT,
    }


def require_token(x_devlife_token: str = Header(None)):
    """HTTP dependency: require the session token header for privileged file ops."""
    if not security.verify_token(x_devlife_token):
        raise HTTPException(status_code=403, detail="invalid or missing session token")


def _files_enabled():
    if not FILES_ENABLED:
        raise HTTPException(status_code=404, detail="file API disabled")


def _fs_error_response(e: Exception) -> JSONResponse:
    if isinstance(e, PermissionError):
        return JSONResponse(status_code=403, content={"error": str(e)})
    if isinstance(e, (FileNotFoundError, NotADirectoryError)):
        return JSONResponse(status_code=404, content={"error": str(e)})
    if isinstance(e, (ValueError, IsADirectoryError)):
        return JSONResponse(status_code=400, content={"error": str(e)})
    logger.warning("file op failed: %s", e)
    return JSONResponse(status_code=500, content={"error": "file operation failed"})


class FileWriteBody(BaseModel):
    path: str = Field(..., max_length=4096)
    content: str = Field(..., max_length=5_000_000)


class FilePathBody(BaseModel):
    path: str = Field(..., max_length=4096)
    kind: str = Field("file", max_length=8)


class FileRenameBody(BaseModel):
    src: str = Field(..., max_length=4096)
    dst: str = Field(..., max_length=4096)


@app.get("/api/files/tree", dependencies=[Depends(require_token)])
async def files_tree(path: str = "", _=Depends(_files_enabled)):
    try:
        return file_api.list_dir(path)
    except Exception as e:
        return _fs_error_response(e)


@app.get("/api/files/read", dependencies=[Depends(require_token)])
async def files_read(path: str, _=Depends(_files_enabled)):
    try:
        return file_api.read_file(path)
    except Exception as e:
        return _fs_error_response(e)


@app.post("/api/files/write", dependencies=[Depends(require_token)])
async def files_write(body: FileWriteBody, _=Depends(_files_enabled)):
    try:
        return file_api.write_file(body.path, body.content)
    except Exception as e:
        return _fs_error_response(e)


@app.post("/api/files/create", dependencies=[Depends(require_token)])
async def files_create(body: FilePathBody, _=Depends(_files_enabled)):
    try:
        return file_api.create(body.path, body.kind)
    except Exception as e:
        return _fs_error_response(e)


@app.post("/api/files/rename", dependencies=[Depends(require_token)])
async def files_rename(body: FileRenameBody, _=Depends(_files_enabled)):
    try:
        return file_api.rename(body.src, body.dst)
    except Exception as e:
        return _fs_error_response(e)


@app.post("/api/files/delete", dependencies=[Depends(require_token)])
async def files_delete(body: FilePathBody, _=Depends(_files_enabled)):
    try:
        return file_api.delete(body.path)
    except Exception as e:
        return _fs_error_response(e)


@app.post("/api/codeserver/start", dependencies=[Depends(require_token)])
async def codeserver_start():
    if not CODE_SERVER_ENABLED:
        raise HTTPException(status_code=404, detail="code-server disabled")
    loop = asyncio.get_running_loop()
    try:
        url = await loop.run_in_executor(None, code_server.ensure_running)
        return {"url": url}
    except FileNotFoundError:
        return JSONResponse(status_code=503, content={
            "error": "code-server not installed",
            "hint": "Install: curl -fsSL https://code-server.dev/install.sh | sh",
        })
    except Exception as e:
        logger.warning("code-server start failed: %s", e)
        return JSONResponse(status_code=500, content={"error": "failed to start code-server"})


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
    while len(app_state.pending_patches) >= 100:
        app_state.pending_patches.pop(next(iter(app_state.pending_patches)))
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
    state = security.new_state()
    auth_url = bio.get_auth_url(WHOOP_REDIRECT_URI, state)
    return RedirectResponse(url=auth_url)


@app.get("/api/whoop/callback")
async def whoop_callback(code: str = None, state: str = None, error: str = None):
    if error or not code:
        return JSONResponse({"error": error or "No code received"}, status_code=400)
    if not security.consume_state(state):
        # CSRF guard: the state must match one we issued and hasn't expired/been used
        return JSONResponse({"error": "Invalid or expired state"}, status_code=400)
    success = bio.exchange_token(code, WHOOP_REDIRECT_URI)
    if success:
        broadcast_sync({"type": "whoop_connected"})
        return RedirectResponse(url=ALLOWED_ORIGINS[0])
    return JSONResponse({"error": "Token exchange failed"}, status_code=500)


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    if not security.check_origin(ws):
        await ws.close(code=1008)
        return
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
                if not isinstance(action, str) or len(action) > WS_MAX_ACTION_CHARS:
                    continue
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
                if app_type not in WS_VALID_APP_TYPES:
                    continue
                content = data.get("content", "")
                if not isinstance(content, str) or len(content) > WS_MAX_CONTENT_CHARS:
                    continue
                kwargs = {}
                for key in ("language", "cursor_line", "url", "shell", "platform"):
                    val = data.get(key)
                    if isinstance(val, str) and len(val) <= WS_MAX_KWARG_CHARS:
                        kwargs[key] = val
                    elif isinstance(val, int):
                        kwargs[key] = val
                with app_state.content_lock:
                    app_state.pending_content[app_type] = {
                        "content": content,
                        "timestamp": time.time(),
                        "changed": True,
                        "kwargs": kwargs,
                    }

            elif data.get("type") == "mock_state":
                state_num = data.get("state")
                if state_num in [1, 2, 3, 4, 5]:
                    mock.set_state(state_num)
                    # Lock this state so the 5s WHOOP poll can't override it and the smooth
                    # number transition can't make it flicker through neighbouring states.
                    forced = mock.get_state_name()
                    now = time.time()
                    app_state.forced_state = forced
                    app_state.forced_until = now + DEMO_STATE_HOLD_SECONDS
                    app_state.mock_override_until = now + DEMO_STATE_HOLD_SECONDS
                    bio.current_state = forced
                    await ws.send_json(build_biometric_msg(mock.get_data(), forced))
                    app_state.intervention_cooldown_until = 0
                    app_state.last_analyzed_hashes.clear()
                    app_state.suppressed_hashes.clear()
                    brain.last_intervention_time = 0

            elif data.get("type") == "set_lang":
                lang = data.get("lang")
                if lang in ("ro", "en"):
                    brain.lang = lang
                    content_analyzer.lang = lang

            elif data.get("type") == "set_personality":
                p = data.get("personality")
                if p in ("coach", "friend", "sarcastic"):
                    brain.personality = p

            elif data.get("type") == "resume_live":
                # "Back to live" toggle: drop the demo lock so real WHOOP data resumes at once.
                app_state.forced_state = None
                app_state.forced_until = 0.0
                app_state.mock_override_until = 0.0

            elif data.get("type") == "app_focus":
                app_type = data.get("app_type")
                if app_type is not None and app_type not in WS_VALID_APP_TYPES:
                    continue
                if app_type:
                    broadcast_sync({
                        "type": "app_focus_change",
                        "app_type": app_type,
                        "timestamp": time.time(),
                    })

            elif data.get("type") == "heart_rate":
                # live BPM from frontend Web Bluetooth pairing (WHOOPBluetooth.js)
                # downstream: biometric_loop reads bio.live_heart_rate when ble_fresh
                bpm = data.get("bpm")
                if isinstance(bpm, (int, float)) and 30 <= bpm <= 220:
                    bio.live_heart_rate = int(bpm)
                    bio.live_hr_timestamp = time.time()

            elif data.get("type") == "run_error":
                # user clicked Run in the desk code editor and got a runtime error
                # bypass the pending_content loop -- this is an explicit, user-initiated event
                code = (data.get("code") or "")[:50000]
                error = (data.get("error") or "")[:50000]
                lang = data.get("language") or "python"
                if not isinstance(lang, str) or len(lang) > 50:
                    lang = "python"
                if not code or not error:
                    continue

                loop = asyncio.get_event_loop()
                try:
                    analysis = await loop.run_in_executor(
                        None,
                        lambda: content_analyzer.analyze(
                            app_type="code",
                            content=code,
                            extra_context=f"Runtime error from user execution:\n{error}",
                            language=lang,
                        ),
                    )
                except Exception as e:
                    logger.warning("run_error analysis failed: %s", e)
                    continue

                if not analysis:
                    continue

                state = bio.current_state
                modifiers = bio.get_personality_modifiers(state)
                intervention = brain.process(analysis, state, modifiers)
                if intervention:
                    app_state.intervention_cooldown_until = time.time() + 8
                    bio_data = mock.get_data() if (not bio.access_token or time.time() < app_state.mock_override_until) else (bio.current_data or {})
                    intervention["biometric"] = build_biometric_msg(bio_data, state)
                    intervention["app_type"] = "code"
                    intervention["source"] = "runtime_error"
                    await broadcast(intervention)
                    app_state.intervention_history.append(intervention)
                    if len(app_state.intervention_history) > 50:
                        app_state.intervention_history.pop(0)
                    try:
                        db.save_intervention(
                            state=state,
                            source="runtime_error",
                            claude_text=intervention["message"],
                            content_hash=None,
                        )
                    except Exception as e:
                        logger.warning("db.save_intervention failed: %s", e)
                    logger.info("run_error intervention (%s): %s...", state, intervention["message"][:80])

    except WebSocketDisconnect:
        if ws in app_state.connected_clients:
            app_state.connected_clients.remove(ws)
        logger.info("ws client offline (%d total)", len(app_state.connected_clients))


async def _gate_privileged_ws(ws: WebSocket, enabled: bool) -> bool:
    """Origin + feature-flag + session-token gate for the privileged local WS endpoints.
    Returns True if accepted (and the socket is already accept()-ed), False if rejected."""
    if not enabled:
        await ws.close(code=1008)
        return False
    if not security.check_origin(ws):
        await ws.close(code=1008)
        return False
    if not security.verify_token(ws.query_params.get("token")):
        await ws.close(code=1008)
        return False
    await ws.accept()
    return True


async def _run_inline(ws: WebSocket, req_id, prefix, suffix, language, path, state, stress):
    try:
        async for delta in inline_completer.stream(prefix, suffix, language, path,
                                                   state=state, estimated_stress=stress):
            await ws.send_json({"id": req_id, "delta": delta})
        await ws.send_json({"id": req_id, "done": True, "state": state})
    except asyncio.CancelledError:
        pass  # superseded by a newer keystroke
    except Exception as e:
        logger.warning("inline run failed: %s", e)
        try:
            await ws.send_json({"id": req_id, "done": True})
        except Exception:
            pass


@app.websocket("/lsp/{language}")
async def lsp_ws(ws: WebSocket, language: str):
    if not await _gate_privileged_ws(ws, LSP_ENABLED):
        return
    if not lsp_bridge.server_available(language):
        try:
            await ws.send_json({"error": "language server not installed", "language": language})
            await ws.close(code=1011)
        except Exception:
            pass
        return
    await lsp_bridge.run_bridge(ws, language)


@app.websocket("/inline")
async def inline_ws(ws: WebSocket):
    if not await _gate_privileged_ws(ws, INLINE_AI_ENABLED):
        return
    current = None
    try:
        while True:
            msg = await ws.receive()
            if msg.get("type") == "websocket.disconnect":
                break
            text = msg.get("text")
            if not text:
                continue
            try:
                req = json.loads(text)
            except (json.JSONDecodeError, TypeError):
                continue
            # a newer request cancels the in-flight one (stale completions are useless)
            if current and not current.done():
                current.cancel()
            current = asyncio.create_task(_run_inline(
                ws,
                req.get("id"),
                (req.get("prefix") or "")[-6000:],
                (req.get("suffix") or "")[:2000],
                req.get("language") or "plaintext",
                req.get("path") or "",
                bio.current_state,          # biometric Cursor: tune completions to live state
                bio.estimated_stress,
            ))
    except WebSocketDisconnect:
        pass
    finally:
        if current and not current.done():
            current.cancel()


@app.websocket("/files/watch")
async def files_watch_ws(ws: WebSocket):
    if not await _gate_privileged_ws(ws, FILES_ENABLED):
        return
    from watchfiles import awatch
    root = Path(WORKSPACE_ROOT).resolve()
    stop = asyncio.Event()

    async def watcher():
        try:
            async for changes in awatch(str(root), stop_event=stop):
                payload = []
                for change, path in changes:
                    try:
                        rel = str(Path(path).resolve().relative_to(root))
                    except Exception:
                        continue
                    payload.append({"change": change.name, "path": rel})
                if payload:
                    await ws.send_json({"type": "fs_change", "changes": payload})
        except Exception:
            pass

    task = asyncio.create_task(watcher())
    try:
        while True:
            msg = await ws.receive()
            if msg.get("type") == "websocket.disconnect":
                break
    except WebSocketDisconnect:
        pass
    finally:
        stop.set()
        task.cancel()


@app.websocket("/terminal")
async def terminal_ws(ws: WebSocket):
    if not await _gate_privileged_ws(ws, TERMINAL_ENABLED):
        return

    loop = asyncio.get_running_loop()
    out_queue: asyncio.Queue = asyncio.Queue()
    session = terminal_pty.PtySession(cwd=WORKSPACE_ROOT)
    try:
        session.spawn()
    except Exception as e:
        logger.error("pty spawn failed: %s", e)
        await ws.close(code=1011)
        return
    logger.info("terminal session started (pid %s)", session.pid)

    # add_reader runs in the loop thread, so put_nowait is safe; a single sender task
    # drains the queue in order to preserve byte ordering on the socket.
    session.attach_reader(loop, lambda data: out_queue.put_nowait(data))

    async def pump_output():
        while True:
            data = await out_queue.get()
            if data is None:  # EOF — child exited
                break
            try:
                await ws.send_bytes(data)
            except Exception:
                break
        try:
            await ws.close()
        except Exception:
            pass

    sender = asyncio.create_task(pump_output())
    try:
        while True:
            msg = await ws.receive()
            if msg.get("type") == "websocket.disconnect":
                break
            if msg.get("bytes") is not None:
                session.write(msg["bytes"])  # keystrokes
            elif msg.get("text") is not None:
                text = msg["text"]
                try:
                    ctrl = json.loads(text)
                except (json.JSONDecodeError, TypeError):
                    session.write(text.encode())
                    continue
                if isinstance(ctrl, dict) and ctrl.get("type") == "resize":
                    session.resize(int(ctrl.get("rows", 24)), int(ctrl.get("cols", 80)))
                else:
                    session.write(text.encode())
    except WebSocketDisconnect:
        pass
    finally:
        sender.cancel()
        session.close()
        logger.info("terminal session closed")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=HOST, port=PORT)
