import asyncio
import json 
import time
import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles 
from fastapi.responses import JSONResponse 

from config import (
    CLAUDE_API_KEY, WHOOP_CLIENT_ID, WHOOP_CLIENT_SECRET, 
    USE_MOCK_BIOMETRICS, HOST, PORT
)
from screen_capture import ScreenCapture 
from vision_analyzer import VisionAnalyzer 
from biometric_engine import BiometricEngine 
from mock_biometrics import MockBiometrics 
from ghost_brain import GhostBrain 
from context_tracker import ContextTracker 
from fallback_response import get_fallback_intervention 

# instances global component
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
    try: 
        loop = asyncio.get_event_loop()
        if loop.is_running():
            asyncio.run_coroutine_threadsafe(broadcast(message), loop)
        else: 
            loop.run_until_complete(broadcast(message))
    except RuntimeError: 
        loop = asyncio.new_event_loop()
        loop.run_until_complete(broadcast(message))
        loop.close()

# stalking the biometric state change 
def on_state_change(old_state, new_state): 
    """notification in the fronend when the user's state changes"""
    # investigating why did the user's state changed 
    data = mock.get_data() if USE_MOCK_BIOMETRICS else bio.current_data or {}
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
        "reason": reason
    }
    broadcast_sync(message)

    modifiers = bio.get_personality_modifiers(new_state)
    capture.set_interval(modifiers.get("capture_interval", 3))

bio.on_state_change(on_state_change)

# loop for biometric polling

def biometric_loop():
    """
    polls biometric data every 5 seconds. 
    in real mode, it fetches from the user's whoop
    in mock mode from MockBiometrics
    """
    while ghost_running:
        if USE_MOCK_BIOMETRICS:
            data = mock.get_data()
        else: 
            data = bio.fetch_data()
        
        if data: 
            state = bio.classify(data)

            # sending biometric update to electron front end 
            biometric_msg = {
                "type": "biometric_update",
                "heartRate": round(data.get("heartRate", 0)),
                "recovery": round(data.get("recovery", 0)), 
                "strain": round(data.get("strain", 0), 1),
                "sleepPerformance": round(data.get("sleepPerformance", 0), 2)
            }
            broadcast_sync(biometric_msg)
        time.sleep(5)

# main ghost loooooop

def ghost_loop():
    """
    everytime iteration is gets the latest screenshots 
    ships them to claude vision for analysis 
    passes analysis and biometrics to ghost_brain
    if the ghost intervenes it sends to frond end via WebSocket 
    adapts the loop timing to biometric state
    """
    # give the capture service a moment to get its 1st ss
    time.sleep(2)
    while ghost_running:
        try: 
            # get current state
            state = bio.current_state
            modifiers = bio.get_personality_modifiers(state)

            # get screenshots
            screenshots = capture.get_buffer()

            if not screenshots: 
                # retry
                time.sleep(1)
                continue
            
            # get summary from the tracker 
            context_summary = tracker.get_summary()

            # send to claude vision
            try: 
                analysis = vision.analyze(screenshots, context_summary)
            except Exception as e: 
                print(f"[ghost_loop] Vision analysis failed: {e}")
                time.sleep(modifiers.get("capture_interval", 3))
                continue

            tracker.update(analysis, state)

            # ask ghost if he should intervene or not
            intervention = brain.process(analysis, state, modifiers)
            if intervention: 
                if USE_MOCK_BIOMETRICS: 
                    bio_data = mock.get_data()
                else: 
                    bio_data = bio.current_data or {}
                
                intervention["biometric"] = {
                    "heartRate": round(bio_data.get("heartRate", 0)), 
                    "recovery": round(bio_data.get("recovery", 0)), 
                    "strain": round(bio_data.get("strain", 0), 1), 
                    "sleepPerformance": round(bio_data.get("sleepPerformance", 0), 2)
                }

                # send to electron frontend
                broadcast_sync(intervention)

                # save to history 
                intervention_history.append(intervention)
                if len(intervention_history) > 50:
                    intervention_history.pop(0)
                print(f"[ghost] ({state}) {intervention['message'][:80]}...")
        except Exception as e: 
                print(f"[ghost_loop] Error: {e}")

    # sleep for interval determined by the biometric state of the user
    sleep_time = modifiers.get("capture_interval", 3)
    time.sleep(sleep_time)

# lifecycle of the app

@asynccontextmanager
async def lifespan(app: FastAPI): 
    """start background threads on startup and stop them on close"""
    global ghost_running
    ghost_running = True

    # start screen capture 
    capture.start()
    print("[ghost] Screen capture started")

    # start biometric polling
    bio_thread = threading.Thread(target=biometric_loop, daemon=True)
    bio_thread.start()
    print(f"[ghost] Biometric polling started (mock={USE_MOCK_BIOMETRICS})")

    # start main ghost loop
    ghost_thread = threading.Thread(target=ghost_loop, daemon=True)
    ghost_thread.start()
    print("[ghost] Ghost loop started")
    print(f"[ghost] Server running on http://{HOST}:{PORT}")

    yield 

    # close 
    ghost_running = False
    capture.stop()
    print("[ghost] Shutting down")

# FastAPI
app = FastAPI(title = "Ghost Desktop Agent", lifespan = lifespan)

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
    bio_data = mock.get_data() if USE_MOCK_BIOMETRICS else (bio.current_data or {})

    return {
        "biometric_state": bio.current_state, 
        "biometric_data": bio_data, 
        "last_analysis": vision.last_analysis,
        "interventions_total": brain.intervention.count, 
        "interventions_accepted": brain.accepted_count,
        "interventions_ignored": brain.ignored_count,
        "session_stats": tracker.get_session_stats(),
        "mock_mode": USE_MOCK_BIOMETRICS
    }

@app.post("/api/biometric/mock")
async def set_mock_state (body:dict):
    """
    manually set the biometric state from 1 to 5 
    usign for testing each Ghost personality determined
    """
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

# websocket endpoint
@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    """
    real time connection with Electron
    -intervention messages
    -biometric_update messages
    -state_change messages
    """
    await ws.accept()
    connected_clients.append(ws)
    print(f"[ws] Client connected ({len(connected_clients)} total)")

    # current state on conenction 
    bio_data = mock.get_data() if USE_MOCK_BIOMETRICS else (bio.current_data or {})
    await ws.send_json ({
        "type": "biometric_update", 
        "heartRate": round(bio_data.get("heartRate", 0)),
        "recovery": round(bio_data.get("recovery", 0)), 
        "strain": round(bio_data.get("strain", 0), 1), 
        "state": bio.current_state, 
        "sleepPerformance": round(bio_data.get("sleepPerformance", 0), 2)
    })

    try:
        # listen for the messages coming from the frontend 
        while True: 
            data = await ws.receive_json()

            # handle the user feedback from the Ghost interventions
            if data.get("type") == "feedback": 
                brain.user_feedback(data.get("action", ""))
    except WebSocketDisconnect:
        connected_clients.remove(ws)
        print (f"[ws]Client offline({len(connected_clients)} total)")

#run with server.py
if __name__ == "__main__": 
    import uvicorn
    uvicorn.run(app, host = HOST, port = PORT)
