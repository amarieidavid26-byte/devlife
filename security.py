"""Security primitives for the privileged local endpoints (terminal / files / lsp / inline AI).

The app runs a FastAPI server on the user's own machine. Once it gains a real PTY,
filesystem writes and LSP subprocesses, an unguarded localhost port becomes a remote
code-execution hole: any webpage open in the user's browser could WebSocket into it.

Three layers defend against that:
  1. binding to 127.0.0.1 (config.HOST) — no LAN exposure
  2. an Origin check on every WS handshake — browsers always send Origin and JS cannot
     forge it, so a malicious site at evil.com is rejected (CORS does NOT cover WebSockets)
  3. a per-process session token the frontend reads from /api/session (which CORS keeps
     unreadable cross-origin) and attaches to every privileged call

Plus resolve_in_workspace() to keep all file access inside WORKSPACE_ROOT, and a small
CSRF state store for the WHOOP OAuth round-trip.
"""

import hashlib
import hmac
import logging
import secrets
import time
from pathlib import Path

from config import ALLOWED_ORIGINS, WORKSPACE_ROOT

logger = logging.getLogger(__name__)

# regenerated every process start; never persisted
SESSION_TOKEN = secrets.token_urlsafe(32)

_CSRF_TTL_SECONDS = 600
# states already burned, so a replay is rejected within this process. The VALIDITY of a state
# no longer depends on this dict (it is a signature check), so a uvicorn --reload wiping it can
# only weaken single-use, never reject a legitimate in-flight login -- which was the real cause
# of "the WHOOP login only works sometimes".
_consumed_csrf_states: dict[str, float] = {}
_csrf_signing_key = None


def _csrf_key() -> bytes:
    """Signing key for the stateless CSRF state. Persisted in the local DB so it survives a
    reload/restart (SESSION_TOKEN is regenerated each process and would break in-flight logins).
    """
    global _csrf_signing_key
    if _csrf_signing_key is not None:
        return _csrf_signing_key
    try:
        from persistence import db
        key = db.get_setting("csrf_signing_key")
        if not key:
            key = secrets.token_urlsafe(32)
            db.set_setting("csrf_signing_key", key)
    except Exception as e:
        # DB unavailable (e.g. a unit test with no migrations): fall back to a process-local key.
        # Single-process flows still work; only a cross-reload login would be affected.
        logger.warning("csrf key persistence unavailable (%s); using ephemeral key", e)
        key = secrets.token_urlsafe(32)
    _csrf_signing_key = key.encode()
    return _csrf_signing_key


def check_origin(websocket) -> bool:
    """Allow a WS handshake only from a known Origin.

    A browser always sends Origin and JS cannot spoof it, so this blocks the
    "malicious website connects to your localhost" attack. A non-browser local
    client may omit Origin entirely; we allow that and rely on the session token
    for the privileged endpoints.
    """
    origin = websocket.headers.get("origin")
    if origin is None:
        return True
    return origin in ALLOWED_ORIGINS


def verify_token(token: str | None) -> bool:
    if not token:
        return False
    return secrets.compare_digest(token, SESSION_TOKEN)


def resolve_in_workspace(rel_path: str) -> Path:
    """Resolve a client-supplied path and guarantee it stays inside WORKSPACE_ROOT.

    Resolves symlinks too, so a symlink pointing outside the root is rejected.
    Raises PermissionError on any escape attempt.
    """
    root = Path(WORKSPACE_ROOT).resolve()
    target = (root / (rel_path or "")).resolve()
    if target != root and root not in target.parents:
        raise PermissionError(f"path escapes workspace: {rel_path!r}")
    return target


def new_state() -> str:
    """Issue a signed, single-use CSRF state for the WHOOP OAuth redirect.

    Stateless by design: validity is a signature + timestamp check, so there is no in-memory
    entry to lose if the dev server reloads mid-login. A random nonce keeps two states issued in
    the same second distinct.
    """
    payload = f"{int(time.time())}.{secrets.token_urlsafe(8)}"
    sig = hmac.new(_csrf_key(), payload.encode(), hashlib.sha256).hexdigest()[:32]
    return f"{payload}.{sig}"


def consume_state(state: str | None) -> bool:
    """Validate and burn a CSRF state. Returns False if malformed, mis-signed, expired or reused."""
    if not state or state.count(".") != 2:
        return False
    ts_str, _nonce, sig = state.split(".")
    try:
        issued = int(ts_str)
    except ValueError:
        return False
    now = time.time()
    if now - issued > _CSRF_TTL_SECONDS or issued > now + 60:
        return False
    payload = f"{ts_str}.{_nonce}"
    expected = hmac.new(_csrf_key(), payload.encode(), hashlib.sha256).hexdigest()[:32]
    # compare bytes: compare_digest raises TypeError on non-ASCII str, and sig is caller input
    if not hmac.compare_digest(sig.encode(), expected.encode()):
        return False
    _prune_states()
    if state in _consumed_csrf_states:
        return False   # replay within this process
    _consumed_csrf_states[state] = issued + _CSRF_TTL_SECONDS
    return True


def _prune_states() -> None:
    now = time.time()
    expired = [s for s, exp in _consumed_csrf_states.items() if exp <= now]
    for s in expired:
        _consumed_csrf_states.pop(s, None)
