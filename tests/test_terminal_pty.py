"""Real PTY session behaviour (Phase 2): echo, resize, clean teardown."""

import asyncio

import pytest

import terminal_pty
from config import WORKSPACE_ROOT


@pytest.mark.asyncio
async def test_pty_echo_resize_and_clean_exit():
    loop = asyncio.get_running_loop()
    chunks = []
    eof = asyncio.Event()

    def on_output(data):
        if data is None:
            eof.set()
        else:
            chunks.append(data)

    s = terminal_pty.PtySession(cwd=WORKSPACE_ROOT, shell="/bin/sh")
    s.spawn()
    s.attach_reader(loop, on_output)

    s.resize(30, 100)            # must not raise
    s.write(b"echo hello_pty\n")

    for _ in range(60):
        await asyncio.sleep(0.05)
        if any(b"hello_pty" in c for c in chunks):
            break
    assert any(b"hello_pty" in c for c in chunks), "shell did not echo"

    # exiting the shell closes the pty → reader sees EOF
    s.write(b"exit\n")
    try:
        await asyncio.wait_for(eof.wait(), timeout=3)
    except asyncio.TimeoutError:
        pass
    s.close()  # must not raise even after the child is gone
    assert eof.is_set(), "EOF should fire after the shell exits"
    assert s.fd is None and s.pid is None
