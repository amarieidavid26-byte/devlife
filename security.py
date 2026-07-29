"""Security primitives for the privileged local endpoints (terminal / files / lsp / inline AI).

Three layers: 127.0.0.1 bind, an Origin check on every WS handshake (CORS does not cover
WebSockets), and a per-process session token from /api/session. resolve_in_workspace()
bounds file access to WORKSPACE_ROOT; the CSRF store covers the WHOOP OAuth round-trip.
"""

import hashlib
import hmac
import logging
import re
import secrets
import time
from pathlib import Path

from config import ALLOWED_ORIGINS, WORKSPACE_ROOT

logger = logging.getLogger(__name__)

# Files whose contents must never be sent to Claude (secrets/keys/credentials). Server-side
# backstop for the inline completer; the primary guards are client-side. Kept in sync with two
# other copies: frontend/src/utils/sensitiveFiles.js and vscode-extension/extension.js.
_SENSITIVE_FILE_RE = re.compile(
    r"(^|/)(\.env[^/]*|[^/]*\.pem|id_rsa[^/]*|[^/]*credentials[^/]*|COMMIT_EDITMSG)$",
    re.IGNORECASE,
)


def is_sensitive_path(path: str | None) -> bool:
    return bool(path) and bool(_SENSITIVE_FILE_RE.search(path))

# regenerated every process start; never persisted
SESSION_TOKEN = secrets.token_urlsafe(32)

_CSRF_TTL_SECONDS = 600
# replay guard only: validity is a signature check, so a dev-server reload wiping this
# dict cannot reject an in-flight login
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
    """Reject WS handshakes from unknown Origins. A missing Origin (non-browser local
    client) is allowed; the session token still gates the privileged endpoints."""
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
