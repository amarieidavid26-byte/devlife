import asyncio
import json
import os
import time
import threading
import random
from contextlib import asynccontextmanager


from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse, RedirectResponse

from config import (
    CLAUDE_API_KEY, WHOOP_CLIENT_ID, WHOOP_CLIENT_SECRET,
    HOST, PORT as _CONFIG_PORT,
    GAME_MODE, CONTENT_REANALYZE_INTERVAL, CONTENT_MIN_LENGTH
)

PORT = 8000
if GAME_MODE: 
    from content_analyzer import ContentAnalyzer
else: 
    from screen_capture import ScreenCapture
    from vision_analyzer import VisionAnalyzer
from biometric_engine import BiometricEngine 
from mock_biometrics import MockBiometrics 
from ghost_brain import GhostBrain 
from context_history import ContextTracker
from fallback_responses import get_fallback_intervention

# instances global component
if GAME_MODE:
    content_analyzer = ContentAnalyzer(CLAUDE_API_KEY)
else: 
    capture = ScreenCapture()
    vision = VisionAnalyzer(CLAUDE_API_KEY)
bio = BiometricEngine(WHOOP_CLIENT_ID, WHOOP_CLIENT_SECRET)
mock = MockBiometrics()
brain = GhostBrain(CLAUDE_API_KEY)
tracker = ContextTracker()

# electron connection overlays 
connected_clients: list[WebSocket] = []

# last 50 ghost interventions for history 
intervention_history: list[dict] = []

# stop the ghost loop on shutdown 
ghost_running = False 
pending_content = {}
content_lock = threading.Lock()
last_analyzed_hashes = {}          # {app_type: hash} — skip re-analysis of identical content
intervention_cooldown_until = 0    # timestamp — skip ALL analysis during cooldown
last_intervention_hash = None      # hash of content that triggered the last intervention
suppressed_hashes = {}        # {hash: expiry_timestamp} — suppressed for 10s after user responds
mock_override_until = 0
sleep_mode_active = False
sleep_low_hr_count = 0
ble_disconnected = False 
ble_disconnected_timer = None
last_coding_activity = 0
main_event_loop: asyncio.AbstractEventLoop = None

# electron broadcast 
async def broadcast(message: dict):
    """ sending message to the connected electron clients""" 
    dead_clients = []
    for client in connected_clients:
        try: 
            await client.send_json(message)
        except Exception: 
            dead_clients.append(client)
    # removing the offline ones 
    for client in dead_clients:
        connected_clients.remove(client)

def broadcast_sync (message: dict):
    """sync wrapper for broadcast, using from background threads.
    create a new event loop if needed cause some threads dont have one """
    if main_event_loop is None: 
        return
    asyncio.run_coroutine_threadsafe(broadcast(message), main_event_loop)

def build_biometric_msg(data, state):
    ble_active = bio.live_heart_rate and (time.time() - bio.live_hr_timestamp < 5)
    source = "whoop" if bio.access_token and time.time() >= mock_override_until else "mock"
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
        "skinTemp": round(data.get("skinTemp", 0), 1)
    }

# stalking the biometric state change 
def on_state_change(old_state, new_state): 
    """notification in the fronend when the user's state changes"""
    # investigating why did the user's state changed 
    data = mock.get_data() if (not bio.access_token or time.time() < mock_override_until) else bio.current_data or {}
    reason = "Biometric data changed"
    if data.get("strain", 0) > 16:
        reason = "Strain over 16"
    elif data.get("recovery", 100) <40:
        reason = "Recovery dropped below 40"
    elif data.get("sleepPerformance", 1) < 0.7: 
        reason = "Poor sleep performance"

    message = {
        "type": "state_change", 
        "from": old_state, 
        "to": new_state,
        "reason": reason,
        "estimated_stress": bio.estimated_stress
    }
    broadcast_sync(message)
    if not GAME_MODE: 
        modifiers = bio.get_personality_modifiers(new_state)
        capture.set_interval(modifiers.get("capture_interval", 3))

bio.on_state_change(on_state_change)

_sim_hr = 67.0
_SIM_HR_RANGES = {
    "RELAXED": (62, 72),
    "DEEP_FOCUS": (65, 78),
    "STRESSED": (85, 100),
    "FATIGUED": (55, 65),
    "WIRED": (80, 95)
}

def _simulate_hr(state):
    global _sim_hr
    lo, hi = _SIM_HR_RANGES.get(state, (62, 72))
    mid = (lo + hi) / 2
    _sim_hr += (mid - _sim_hr) * 0.15 + random.uniform(-3, 3)
    _sim_hr = max(lo, min(hi, _sim_hr))
    return round(_sim_hr)

def _on_ble_disconnect_timeout():
    global sleep_mode_active
    if ble_disconnected and not sleep_mode_active:
        sleep_mode_active = True 
        broadcast_sync({"type": "sleep_mode", "active": True})
        print("[bio] sleep mode on, ble disconnected for 10s")

def _check_sleep_mode(data):
    global sleep_mode_active, sleep_low_hr_count

    if ble_disconnected:
        return

    ble_fresh = bio.live_heart_rate >= 0 and (time.time() - bio.live_hr_timestamp < 10)
    if not ble_fresh:
        if sleep_mode_active:
            sleep_mode_active = False
            sleep_low_hr_count = 0
            broadcast_sync({"type": "sleep_mode", "active": False})
            print("[bio] Sleep mode OFF — no BLE data")
        return

    hr = bio.live_heart_rate
    if hr < 50:
        sleep_low_hr_count += 1
        if sleep_low_hr_count >= 5 and not sleep_mode_active:
            sleep_mode_active = True
            broadcast_sync({"type": "sleep_mode", "active": True})
            print(f"[bio] Sleep mode ON — low HR={hr} for {sleep_low_hr_count} cycles")
    else: 
        if sleep_mode_active: 
            sleep_mode_active = False
            broadcast_sync({"type": "sleep_mode", "active": False})
            print(f"[bio] sleep mode off, HR={hr}")

# loop for biometric polling

def biometric_loop():
    global last_coding_activity
    while ghost_running:
        is_whoop = False
        if time.time() < mock_override_until:
            data = mock.get_data()
        elif bio.access_token:
            data = bio.fetch_data()
            if data is None:
                data = mock.get_data()
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

            if is_whoop:
                src = "ble" if ble_fresh else "whoop"
                print(f"[bio] WHOOP state classified: {state} (rec={data.get('recovery')}, strain={data.get('strain')}, hrv={data.get('hrv')}, hr={data.get('heartRate')}, src={src})")

            biometric_msg = build_biometric_msg(data,state)
            broadcast_sync(biometric_msg)

        _check_sleep_mode(data) 
        if last_coding_activity > 0 and time.time() - last_coding_activity > 60:
            last_coding_activity = time.time()
            broadcast_sync({"type": "plant_update", "delta": -2})

        time.sleep(5)


# main ghost loooooop

def ghost_loop():
    """
    The main ghost loop. Runs in a background thread.

    GAME_MODE (True): Waits for content from in-game apps via WebSocket.
    DESKTOP_MODE (False): Captures screenshots and uses Claude Vision.
    """
    global intervention_cooldown_until, last_intervention_hash
    time.sleep(2)

    while ghost_running:
        try:
            state = bio.current_state
            modifiers = bio.get_personality_modifiers(state)

            if GAME_MODE:
                # game mode - analyze content from in-game apps
                analysis = None
                app_type = None
                content_data = None
                content_hash = None

                # grab the most recent pending content
                with content_lock:
                    latest_time = 0
                    for atype, data in pending_content.items():
                        if data["timestamp"] > latest_time:
                            latest_time = data["timestamp"]
                            app_type = atype
                            content_data = data

                if content_data and len(content_data.get("content", "")) >= CONTENT_MIN_LENGTH:
                    content_hash = hash(content_data["content"][:500])

                    # DEDUP: skip if we already analyzed this exact content
                    already_analyzed = content_hash == last_analyzed_hashes.get(app_type)
                    # COOLDOWN: skip if Ghost just sent an intervention
                    in_cooldown = time.time() < intervention_cooldown_until
                    # SUPPRESSED: skip if user responded recently (10s window)
                    user_suppressed = suppressed_hashes.get(content_hash, 0) > time.time()

                    if already_analyzed or in_cooldown or user_suppressed:
                        # clear this pending content — it's been handled
                        with content_lock:
                            if app_type in pending_content:
                                del pending_content[app_type]
                    else:
                        context_summary = tracker.get_summary()
                        try:
                            analysis = content_analyzer.analyze(
                                app_type=app_type,
                                content=content_data["content"],
                                extra_context=context_summary or "",
                                **content_data.get("kwargs", {})
                            )
                            # mark this content hash as analyzed
                            last_analyzed_hashes[app_type] = content_hash
                            # clear pending content — we consumed it
                            with content_lock:
                                if app_type in pending_content:
                                    del pending_content[app_type]
                        except Exception as e:
                            print(f"[ghost_loop] Content analysis failed: {e}")

                # process the analysis through ghost_brain if we got results
                if analysis:
                    tracker.update(analysis, state, bio.estimated_stress)
                    intervention = brain.process(analysis, state, modifiers)

                    if intervention:
                        # set 8s cooldown — short enough for demo re-triggering
                        intervention_cooldown_until = time.time() + 8
                        last_intervention_hash = content_hash
                        # clear analyzed hashes so same content can re-trigger after cooldown
                        last_analyzed_hashes.clear()
                        bio_data = mock.get_data() if (not bio.access_token or time.time() < mock_override_until) else (bio.current_data or {})
                        intervention["biometric"] = build_biometric_msg(bio_data, state)
                        intervention["app_type"] = app_type
                        broadcast_sync(intervention)
                        intervention_history.append(intervention)
                        if len(intervention_history) > 50:
                            intervention_history.pop(0)
                        print(f"[ghost] ({state}/{app_type}) {intervention['message'][:80]}...")
                        plant_delta = -25 if intervention.get("priority") == "critical" else -15
                        broadcast_sync({"type": "plant_update", "delta": plant_delta})
                    else: 
                        broadcast_sync({"type": "plant_update", "delta": 10})

            else:
                screenshots = capture.get_buffer()

                if not screenshots:
                    time.sleep(1)
                    continue

                context_summary = tracker.get_summary()

                # send to claude vision for analysis
                try:
                    analysis = vision.analyze(screenshots, context_summary)
                except Exception as e:
                    print(f"[ghost_loop] Vision analysis failed: {e}")
                    time.sleep(modifiers.get("capture_interval", 3))
                    continue

                # update the context tracker with this analysis
                tracker.update(analysis, state, bio.estimated_stress)

                # ask if the ghost should intervene 
                intervention = brain.process(analysis, state, modifiers)

                # truthiness 
                if intervention:
                    bio_data = mock.get_data() if (not bio.access_token or time.time() < mock_override_until) else (bio.current_data or {})
                    intervention["biometric"] = build_biometric_msg(bio_data, state)
                    broadcast_sync(intervention)
                    intervention_history.append(intervention)
                    if len(intervention_history) > 50:
                        intervention_history.pop(0)
                    print(f"[ghost] ({state}) {intervention['message'][:80]}...")   

        except Exception as e:
            print(f"[ghost_loop] Error: {e}")
            import traceback
            traceback.print_exc()
        time.sleep(1)

# lifecycle of the app

@asynccontextmanager
async def lifespan(app: FastAPI): 
    """start background threads on startup and stop them on close"""
    global ghost_running, main_event_loop
    ghost_running = True

    main_event_loop = asyncio.get_event_loop()
    if not GAME_MODE:
        capture.start()
        print("[ghost] Screen capture started")
    else:
        print("[ghost] Game mode. waiting for content from PixiJS frontend")
    
    bio_thread = threading.Thread(target = biometric_loop, daemon = True)
    bio_thread.start()
    ghost_thread = threading.Thread(target = ghost_loop, daemon = True)
    ghost_thread.start()
    print(f"[ghost] Ghost loop started")
    print(f"[ghost] Server running on http://{HOST}:{PORT}")
    yield

    #shutdown
    ghost_running = False
    if not GAME_MODE: 
        capture.stop()
    main_event_loop = None
    print("[ghost] Shutting down")
    

# FastAPI
app = FastAPI(title = "Ghost Desktop Agent", lifespan = lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# test page from public/
app.mount("/public", StaticFiles(directory="public"), name="public")

# rest endpoints
@app.get ("/health")
async def health():
    """simple health check, let frontend know Ghost is running"""
    return {"status": "alive", "ghost": "watching"}

@app.get("/api/status")
async def status():
    """
    return current state of the ghost
    -biometric state, data
    -last vision return
    -ghost brain stats
    -session stats from tracker
    """
    bio_data = mock.get_data() if (not bio.access_token or time.time() < mock_override_until) else (bio.current_data or {})

    return {
        "biometric_state": bio.current_state, 
        "biometric_data": bio_data, 
        "last_analysis": content_analyzer.last_analysis if GAME_MODE else vision.last_analysis,
        "interventions_total": brain.intervention_count, 
        "interventions_accepted": brain.accepted_count,
        "interventions_ignored": brain.ignored_count,
        "session_stats": tracker.get_session_stats(),
        "mock_mode": not bio.access_token or time.time() < mock_override_until,
        "whoop_connected": bio.access_token is not None,
        "estimated_stress": bio.estimated_stress,
        "hrv_baseline": bio.hrv_baseline,
        "hrv_current": bio_data.get("hrv", 0),
        "game_mode": GAME_MODE,
        "current_app": content_analyzer.last_analysis.get("app") if GAME_MODE and content_analyzer.last_analysis else None,
    }

@app.post("/api/biometric/mock")
async def set_mock_state (body:dict):
    state_num = body.get ("state")
    if state_num not in [1, 2, 3, 4, 5]:
        return JSONResponse(
            status_code = 400,
            content = {"error": "state must be 1-5"}
        )

    mock.set_state(state_num)

    # wait a moment and then classify 
    await asyncio.sleep(0.3)
    data = mock.get_data()
    new_state = bio.classify(data)

    return {
        "ok": True, 
        "preset": state_num,
        "state": new_state,
        "data": data
    }

@app.post("/api/feedback")
async def user_feedback(body: dict):
    """user's reaction/response to a intervention made by Ghost"""
    action = body.get("action", "")
    brain.user_feedback(action)
    return {"ok": True, "accepted": brain.accepted_count, "ignored": brain.ignored_count}

@app.get("/api/history")
async def get_history(): 
    return {"interventions": intervention_history[-20:]}


# game mode endpoints 
@app.get("/api/game/apps")
async def get_game_apps():
    return {
        "game_mode": GAME_MODE,
        "apps": {
            "code": {"room_object": "desk_computer", "label": "Code Editor"},
            "terminal": {"room_object": "desk_terminal", "label": "Terminal"},
            "browser": {"room_object": "second_monitor", "label": "Browser"},
            "notes": {"room_object": "whiteboard", "label": "Notes"},
            "chat": {"room_object": "phone", "label": "Chat"}
        }
    }

@app.get("/api/whoop/auth")
async def whoop_auth():
    redirect_uri = "http://localhost:8000/api/whoop/callback"
    auth_url = bio.get_auth_url(redirect_uri)
    return RedirectResponse(url=auth_url)

@app.get("/api/whoop/callback")
async def whoop_callback(code: str = None, error: str = None):
    if error or not code: 
        return JSONResponse({"error": error or "No code received"}, status_code=400)
        redirect_uri = "http://localhost:8000/api/whoop/callback"
        success = bio.exchange_token(code, redirect_uri)
        if success: 
            return RedirectResponse(url="http://localhost:5173")



# websocket endpoint
@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    """
    real time connection with Electron
    -intervention messages
    -biometric_update messages
    -state_change messages
    """
    global suppressed_hashes, intervention_cooldown_until
    await ws.accept()
    connected_clients.append(ws)
    print(f"[ws] Client connected ({len(connected_clients)} total)")

    # current state on conenction
    bio_data = mock.get_data() if (not bio.access_token or time.time() < mock_override_until) else (bio.current_data or {})
    await ws.send_json(build_biometric_msg(bio_data, bio.current_state))

    try:
        # listen for the messages coming from the frontend
        while True:
            raw = await ws.receive_text()
            try:
                data = json.loads(raw)
            except (json.JSONDecodeError, TypeError):
                continue
            if not isinstance(data, dict):
                continue

            # handle the user feedback from the Ghost interventions
            if data.get("type") == "feedback":
                action = data.get("action", "")
                brain.user_feedback(action)
                if action == "Apply Fix":
                    # Apply Fix changes the code — clear everything so Ghost re-analyzes immediately
                    intervention_cooldown_until = 0
                    last_analyzed_hashes.clear()
                    suppressed_hashes.clear()
                else:
                    # suppress re-analysis for 10s so dismissing doesn't immediately re-trigger
                    if last_intervention_hash is not None:
                        suppressed_hashes[last_intervention_hash] = time.time() + 10
                        # evict expired entries to prevent unbounded growth
                        now = time.time()
                        suppressed_hashes = {h: t for h, t in suppressed_hashes.items() if t > now}

            elif data.get("type") == "content_update":
                app_type = data.get("app_type", "code")
                content = data.get("content", "")
                kwargs = {}
                if data.get("language"):
                    kwargs["language"] = data["language"]
                if data.get("cursor_line"): 
                    kwargs["cursor_line"] = data["cursor_line"]
                if data.get("url"): 
                    kwargs["url"] = data["url"]
                if data.get("shell"):
                    kwargs["shell"] = data["shell"]
                if data.get("platform"):
                    kwargs["platform"] = data["platform"]
                with content_lock:
                    pending_content[app_type] = {
                        "content": content,
                        "timestamp": time.time(),
                        "changed": True,
                        "kwargs": kwargs
                    }
            
            # handle mock biometric state changes from game UI
            elif data.get("type") == "mock_state":
                state_num = data.get("state")
                if state_num in [1, 2, 3, 4, 5]:
                    mock.set_state(state_num)
                    # immediately classify and broadcast — don't wait for biometric_loop
                    data_now = mock.get_data()
                    new_state = bio.classify(data_now)
                    await ws.send_json(build_biometric_msg(data_now, new_state))
                    # clear all anti-spam state so Ghost is ready to analyze immediately
                    intervention_cooldown_until = 0
                    last_analyzed_hashes.clear()
                    suppressed_hashes.clear()
                    brain.last_intervention_time = 0
            
            elif data.get("type") == "app_focus": 
                app_type = data.get("app_type")
                if app_type:
                    broadcast_sync({
                        "type": "app_focus_change",
                        "app_type": app_type,
                        "timestamp": time.time()
                    })
            
    except WebSocketDisconnect:
        connected_clients.remove(ws)
        print (f"[ws]Client offline({len(connected_clients)} total)")

#run with server.py
if __name__ == "__main__": 
    import uvicorn
    uvicorn.run(app, host = HOST, port = PORT)

