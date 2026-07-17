"""Game WebSocket message handlers.

One async function per client->server message type, dispatched via WS_HANDLERS
from server.py's /ws endpoint. Adding a new message type = one function + one
dict entry (this is the extension seam).
"""

import asyncio
import logging
import time

import persistence.db as db
from config import DEMO_STATE_HOLD_SECONDS
from runtime import (
    app_state, bio, mock, brain, content_analyzer,
    broadcast, broadcast_sync, build_biometric_msg,
    WS_MAX_CONTENT_CHARS, WS_MAX_ACTION_CHARS, WS_MAX_KWARG_CHARS, WS_VALID_APP_TYPES,
)

logger = logging.getLogger(__name__)


async def _ws_feedback(ws, data):
    action = data.get("action", "")
    if not isinstance(action, str) or len(action) > WS_MAX_ACTION_CHARS:
        return
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


async def _ws_content_update(ws, data):
    app_type = data.get("app_type", "code")
    if app_type not in WS_VALID_APP_TYPES:
        return
    content = data.get("content", "")
    if not isinstance(content, str) or len(content) > WS_MAX_CONTENT_CHARS:
        return
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


async def _ws_mock_state(ws, data):
    state_num = data.get("state")
    if state_num not in [1, 2, 3, 4, 5]:
        return
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


async def _ws_set_lang(ws, data):
    lang = data.get("lang")
    if lang in ("ro", "en"):
        brain.lang = lang
        content_analyzer.lang = lang


async def _ws_set_personality(ws, data):
    p = data.get("personality")
    if p in ("coach", "friend", "sarcastic"):
        brain.personality = p


async def _ws_resume_live(ws, data):
    # "Back to live" toggle: drop the demo lock so real WHOOP data resumes at once.
    app_state.forced_state = None
    app_state.forced_until = 0.0
    app_state.mock_override_until = 0.0


async def _ws_app_focus(ws, data):
    app_type = data.get("app_type")
    if app_type is None or app_type not in WS_VALID_APP_TYPES:
        return
    broadcast_sync({
        "type": "app_focus_change",
        "app_type": app_type,
        "timestamp": time.time(),
    })


async def _ws_heart_rate(ws, data):
    # live BPM from frontend Web Bluetooth pairing (WHOOPBluetooth.js)
    # downstream: biometric_loop reads bio.live_heart_rate when ble_fresh
    bpm = data.get("bpm")
    if isinstance(bpm, (int, float)) and 30 <= bpm <= 220:
        bio.live_heart_rate = int(bpm)
        bio.live_hr_timestamp = time.time()
    rr = data.get("rr")
    if isinstance(rr, list) and len(rr) <= 30:
        bio.add_rr_intervals(rr)


async def _ws_keystrokes(ws, data):
    # batched typing rhythm from KeystrokeCapture.js: [[iki_ms, category], ...]
    # timings only, never key contents -- see keystroke_dynamics.py
    events = data.get("events")
    if isinstance(events, list) and len(events) <= 300:
        bio.keystrokes.add_events(events)


async def _ws_run_error(ws, data):
    # user clicked Run in the desk code editor and got a runtime error
    # bypass the pending_content loop -- this is an explicit, user-initiated event
    code = data.get("code")
    error = data.get("error")
    if not isinstance(code, str) or not isinstance(error, str):
        return
    code, error = code[:50000], error[:50000]
    lang = data.get("language") or "python"
    if not isinstance(lang, str) or len(lang) > 50:
        lang = "python"
    if not code or not error:
        return

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
        return

    if not analysis:
        return

    state = bio.current_state
    modifiers = bio.get_personality_modifiers(state)
    # tot pe executor, ca analiza de mai sus: process() ajunge la clientul sincron Anthropic
    # (timeout 15s), iar aici suntem pe event loop -- un Run cu eroare bloca broadcast-urile
    # tuturor clientilor. In ghost_loop acelasi apel e deja pe alt fir, deci e tiparul stabilit
    try:
        intervention = await loop.run_in_executor(
            None,
            lambda: brain.process(analysis, state, modifiers),
        )
    except Exception as e:
        logger.warning("run_error intervention failed: %s", e)
        return
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


async def _ws_firewall_block(ws, data):
    """The terminal firewall stopped a risky command. That IS an intervention -- the ghost
    acted on your biometrics -- so it gets counted, recorded and shown in the log like any
    other. No Claude call: the firewall response is a template (same as the ghost loop does
    for risky commands), so blocking stays instant."""
    command = data.get("command", "")
    if not isinstance(command, str) or not command or len(command) > WS_MAX_ACTION_CHARS:
        return
    description = data.get("description", "")
    if not isinstance(description, str) or len(description) > WS_MAX_KWARG_CHARS:
        return

    state = bio.current_state
    if state == "FATIGUED":
        reason = "fatigue_firewall"
    elif state in ("STRESSED", "WIRED"):
        reason = "stress_firewall"
    else:
        reason = "risky_action_detected"

    modifiers = bio.get_personality_modifiers(state)
    message = brain._instant_risky_response(
        reason, {"risky_description": description or command}, state, modifiers
    )
    brain.intervention_count += 1
    brain.last_intervention_time = time.time()

    bio_data = mock.get_data() if (not bio.access_token or time.time() < app_state.mock_override_until) else (bio.current_data or {})
    intervention = {
        "type": "intervention",
        "message": message,
        "priority": "critical" if reason != "risky_action_detected" else "high",
        "reason": reason,
        "state": state,
        "buttons": [],
        "context": command,
        "app_type": "terminal",
        "source": "terminal_firewall",
        "silent": True,   # the terminal already renders its own banner
        "biometric": build_biometric_msg(bio_data, state),
    }
    await broadcast(intervention)
    app_state.intervention_history.append(intervention)
    if len(app_state.intervention_history) > 50:
        app_state.intervention_history.pop(0)
    try:
        db.save_intervention(
            state=state,
            source="terminal_firewall",
            claude_text=message,
            content_hash=None,
        )
    except Exception as e:
        logger.warning("db.save_intervention failed: %s", e)
    logger.info("firewall intervention (%s/%s): %s", state, reason, command[:60])


WS_HANDLERS = {
    "feedback": _ws_feedback,
    "content_update": _ws_content_update,
    "mock_state": _ws_mock_state,
    "set_lang": _ws_set_lang,
    "set_personality": _ws_set_personality,
    "resume_live": _ws_resume_live,
    "app_focus": _ws_app_focus,
    "heart_rate": _ws_heart_rate,
    "keystrokes": _ws_keystrokes,
    "run_error": _ws_run_error,
    "firewall_block": _ws_firewall_block,
}
