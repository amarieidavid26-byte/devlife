"""DevLife backend — FastAPI app, HTTP routes and WebSocket endpoints.

Module map:
- runtime.py  — shared AppState, engine/brain/analyzer singletons, broadcast helpers
- loops.py    — the biometric (5s) and ghost (1s) daemon threads
- ws_game.py  — game WebSocket message handlers (WS_HANDLERS dispatch map)
- server.py   — this file: app wiring, REST routes, game + privileged WS endpoints
"""

import asyncio
import json
import logging
import os
import time
import threading
from contextlib import asynccontextmanager
from pathlib import Path
from pydantic import BaseModel, Field

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect, Header, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse, HTMLResponse
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from config import (
    HOST, PORT as _CONFIG_PORT,
    GAME_MODE, WHOOP_REDIRECT_URI, ALLOWED_ORIGINS, DEMO_OFFLINE,
    WORKSPACE_ROOT, TERMINAL_ENABLED, FILES_ENABLED, LSP_ENABLED, INLINE_AI_ENABLED,
    CODE_SERVER_ENABLED,
)

import security
import terminal_pty
import file_api
import lsp_bridge
import code_server

import persistence.db as db
from session_report import build_report_html
from apply_fix.contract import PatchContract
from apply_fix.validator import validate_patch
from apply_fix.audit import make_patch_hash, record as audit_record

# shared state, singletons and broadcast helpers (tests address these as server.<name>)
from runtime import (
    app_state,
    bio, mock, brain, tracker, content_analyzer, capture, inline_completer,
    get_analyzer, broadcast_sync, build_biometric_msg,
    load_calibration, save_calibration,
    apply_settings, effective_setting, setting_source, SETTINGS_ENV_DEFAULTS,
)
from loops import biometric_loop, ghost_loop
from ws_game import WS_HANDLERS

logger = logging.getLogger(__name__)

limiter = Limiter(key_func=get_remote_address)


class MockStateBody(BaseModel):
    state: int = Field(..., ge=1, le=5)


class SettingsBody(BaseModel):
    # None = leave untouched, "" = clear (fall back to .env), value = set
    claude_api_key: str = Field(None, max_length=500)
    whoop_client_id: str = Field(None, max_length=200)
    whoop_client_secret: str = Field(None, max_length=500)


class FeedbackBody(BaseModel):
    action: str = Field(..., max_length=100)


PORT = int(os.environ.get("PORT", _CONFIG_PORT))


@asynccontextmanager
async def lifespan(app: FastAPI):
    app_state.ghost_running = True
    app_state.main_event_loop = asyncio.get_event_loop()

    db.connect()
    db.start_session(
        mode="game" if GAME_MODE else "desktop",
        whoop_connected=bool(bio.access_token),
    )
    try:
        apply_settings()
    except Exception as e:
        logger.warning("settings load failed: %s", e)
    try:
        load_calibration()
    except Exception as e:
        logger.warning("calibration load failed: %s", e)

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

    try:
        save_calibration()
    except Exception as e:
        logger.warning("calibration save failed: %s", e)
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
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "Authorization", "X-DevLife-Token"],
)



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
    if not effective_setting("claude_api_key") and not DEMO_OFFLINE:
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


@app.get("/api/session/replay")
async def session_replay(session_id: int = None):
    # the black box: biometric samples + interventions of a session on one timeline
    return db.get_session_timeline(session_id)


@app.get("/api/session/report")
async def session_report(session_id: int = None):
    # aggregated stats for a session (defaults to the current/latest one)
    report = db.get_session_report(session_id)
    if report is None:
        return JSONResponse(status_code=404, content={"error": "no session found"})
    return report


@app.get("/api/session/report/html")
async def session_report_html(session_id: int = None, lang: str = "ro"):
    # self-contained exportable HTML report (inline CSS/SVG, opens offline)
    report = db.get_session_report(session_id)
    if report is None:
        return JSONResponse(status_code=404, content={"error": "no session found"})
    page = build_report_html(report, lang if lang in ("ro", "en") else "ro")
    return HTMLResponse(content=page)


def _settings_status():
    # masked view only: source + last 4 chars, the full value never leaves the backend
    out = {}
    for key in SETTINGS_ENV_DEFAULTS:
        value = effective_setting(key)
        out[key] = {
            "configured": bool(value),
            "source": setting_source(key),
            "hint": ("…" + value[-4:]) if len(value) >= 8 else None,
        }
    return out


@app.get("/api/settings", dependencies=[Depends(require_token)])
async def get_settings():
    return _settings_status()


@app.post("/api/settings", dependencies=[Depends(require_token)])
async def post_settings(body: SettingsBody):
    for key in SETTINGS_ENV_DEFAULTS:
        value = getattr(body, key)
        if value is None:
            continue
        value = value.strip()
        if value:
            db.set_setting(key, value)
        else:
            db.delete_setting(key)
    apply_settings()
    logger.info("settings updated via api")
    return _settings_status()


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
            handler = WS_HANDLERS.get(data.get("type"))
            if handler:
                await handler(ws, data)

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

    # defense in depth: even if the browser-side firewall is bypassed (direct WS client),
    # risky commands typed while FATIGUED/STRESSED never reach the shell
    def _block_reason(line):
        if bio.current_state not in ("FATIGUED", "STRESSED"):
            return None
        risky, desc = content_analyzer.detect_risky_commands(line)
        return desc if risky else None

    firewall = terminal_pty.KeystrokeFirewall(_block_reason)

    def _firewall_banner(reason):
        title = "FATIGUE FIREWALL" if bio.current_state == "FATIGUED" else "STRESS ALERT"
        if brain.lang == "ro":
            text = f"{title} (server): comanda blocata -- {reason}. Starea ta: {bio.current_state}."
        else:
            text = f"{title} (server): command blocked -- {reason}. Your state: {bio.current_state}."
        return f"\r\n\x1b[1;31m⛔ {text}\x1b[0m\r\n".encode()

    try:
        while True:
            msg = await ws.receive()
            if msg.get("type") == "websocket.disconnect":
                break
            if msg.get("bytes") is not None:
                passthrough, blocked = firewall.filter(msg["bytes"])  # keystrokes
                session.write(passthrough)
                for reason in blocked:
                    logger.info("server-side firewall blocked: %s (state %s)", reason, bio.current_state)
                    out_queue.put_nowait(_firewall_banner(reason))
                    db.save_intervention(
                        state=bio.current_state,
                        source="terminal-server-firewall",
                        claude_text=f"blocked: {reason}",
                    )
            elif msg.get("text") is not None:
                text = msg["text"]
                try:
                    ctrl = json.loads(text)
                except (json.JSONDecodeError, TypeError):
                    ctrl = None
                if isinstance(ctrl, dict) and ctrl.get("type") == "resize":
                    session.resize(int(ctrl.get("rows", 24)), int(ctrl.get("cols", 80)))
                else:
                    # same firewall on the text path -- it's the obvious bypass vector
                    passthrough, blocked = firewall.filter(text.encode())
                    session.write(passthrough)
                    for reason in blocked:
                        logger.info("server-side firewall blocked (text path): %s", reason)
                        out_queue.put_nowait(_firewall_banner(reason))
    except WebSocketDisconnect:
        pass
    finally:
        sender.cancel()
        session.close()
        logger.info("terminal session closed")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=HOST, port=PORT)
