"""Launch a local code-server (full VS Code in the browser) pointed at WORKSPACE_ROOT,
so the in-game editor can offer an 'Open in full VS Code' power option.

LOCAL ONLY — feature-flagged off on hosted deploys (a public VS Code with filesystem
access would be an RCE). Install once: curl -fsSL https://code-server.dev/install.sh | sh
"""

import logging
import shutil
import socket
import subprocess
import time

from config import WORKSPACE_ROOT, CODE_SERVER_PORT

logger = logging.getLogger(__name__)

_proc = None


def available() -> bool:
    return shutil.which("code-server") is not None


def _port_open(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.3)
        return s.connect_ex(("127.0.0.1", port)) == 0


def url() -> str:
    return f"http://127.0.0.1:{CODE_SERVER_PORT}/?folder={WORKSPACE_ROOT}"


def ensure_running() -> str:
    """Start code-server once (idempotent), wait until it's listening, return its URL.
    Raises FileNotFoundError if the binary isn't installed."""
    global _proc
    if not available():
        raise FileNotFoundError("code-server is not installed")

    if (_proc is not None and _proc.poll() is None) or _port_open(CODE_SERVER_PORT):
        return url()

    _proc = subprocess.Popen(
        ["code-server", "--auth", "none",
         "--bind-addr", f"127.0.0.1:{CODE_SERVER_PORT}", WORKSPACE_ROOT],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    logger.info("code-server starting on 127.0.0.1:%s (pid %s)", CODE_SERVER_PORT, _proc.pid)

    for _ in range(40):  # wait up to ~10s for it to listen
        if _port_open(CODE_SERVER_PORT):
            break
        time.sleep(0.25)
    return url()


def stop():
    global _proc
    if _proc is not None and _proc.poll() is None:
        try:
            _proc.terminate()
        except Exception:
            pass
    _proc = None
