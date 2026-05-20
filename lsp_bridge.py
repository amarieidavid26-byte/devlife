"""Bridge a browser LSP client to a stdio language server (pyright / tsserver).

The frontend speaks plain JSON-RPC: one JSON object per WebSocket text message. This
bridge adds/strips the LSP Content-Length framing for the subprocess's stdio. The server
subprocess runs with cwd = WORKSPACE_ROOT. If the language server binary isn't installed,
the caller degrades gracefully (the editor still works, just without LSP).
"""

import asyncio
import logging
import shutil

from config import WORKSPACE_ROOT

logger = logging.getLogger(__name__)

# language -> stdio language-server command
LSP_COMMANDS = {
    "python": ["pyright-langserver", "--stdio"],
    "typescript": ["typescript-language-server", "--stdio"],
}

_STREAM_LIMIT = 16 * 1024 * 1024  # LSP completion/diagnostic payloads can be large


def server_available(language: str) -> bool:
    cmd = LSP_COMMANDS.get(language)
    return bool(cmd) and shutil.which(cmd[0]) is not None


async def run_bridge(ws, language: str) -> bool:
    cmd = LSP_COMMANDS.get(language)
    if not cmd or shutil.which(cmd[0]) is None:
        return False

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.DEVNULL,
        cwd=WORKSPACE_ROOT,
        limit=_STREAM_LIMIT,
    )
    logger.info("lsp %s started (pid %s)", language, proc.pid)

    async def pump_stdout():
        # parse Content-Length frames from the server, forward the JSON body to the ws
        while True:
            try:
                header = await proc.stdout.readuntil(b"\r\n\r\n")
            except (asyncio.IncompleteReadError, asyncio.LimitOverrunError):
                break
            length = 0
            for line in header.split(b"\r\n"):
                if line.lower().startswith(b"content-length:"):
                    try:
                        length = int(line.split(b":", 1)[1].strip())
                    except ValueError:
                        length = 0
            if length <= 0:
                continue
            try:
                body = await proc.stdout.readexactly(length)
            except asyncio.IncompleteReadError:
                break
            try:
                await ws.send_text(body.decode("utf-8", errors="replace"))
            except Exception:
                break

    out_task = asyncio.create_task(pump_stdout())
    try:
        while True:
            msg = await ws.receive()
            if msg.get("type") == "websocket.disconnect":
                break
            text = msg.get("text")
            if not text:
                continue
            data = text.encode("utf-8")
            proc.stdin.write(f"Content-Length: {len(data)}\r\n\r\n".encode("utf-8") + data)
            await proc.stdin.drain()
    except Exception:
        pass
    finally:
        out_task.cancel()
        try:
            proc.terminate()
        except ProcessLookupError:
            pass
        try:
            await asyncio.wait_for(proc.wait(), timeout=2)
        except Exception:
            try:
                proc.kill()
            except Exception:
                pass
        logger.info("lsp %s closed", language)
    return True
