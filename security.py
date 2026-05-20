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

import logging
import secrets
import time
from pathlib import Path

from config import ALLOWED_ORIGINS, WORKSPACE_ROOT

logger = logging.getLogger(__name__)

# regenerated every process start; never persisted
SESSION_TOKEN = secrets.token_urlsafe(32)

_CSRF_TTL_SECONDS = 600
_pending_csrf_states: dict[str, float] = {}


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
    """Issue a one-time CSRF state for the WHOOP OAuth redirect."""
    state = secrets.token_urlsafe(16)
    _pending_csrf_states[state] = time.time() + _CSRF_TTL_SECONDS
    _prune_states()
    return state


def consume_state(state: str | None) -> bool:
    """Validate and burn a CSRF state. Returns False if unknown or expired."""
    _prune_states()
    if not state:
        return False
    expiry = _pending_csrf_states.pop(state, None)
    return expiry is not None and expiry > time.time()


def _prune_states() -> None:
    now = time.time()
    expired = [s for s, exp in _pending_csrf_states.items() if exp <= now]
    for s in expired:
        _pending_csrf_states.pop(s, None)
