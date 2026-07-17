"""A closed terminal session must not leave a zombie behind.

close() sent SIGHUP and then immediately called waitpid(WNOHANG) -- which returns (0, 0)
because the child has not exited yet, microseconds after the signal. Nothing ever reaped
it, so every terminal session leaked a <defunct> process for the lifetime of the server.
PIDs are finite and the server is long-running.
"""

import os
import subprocess
import time

import pytest

from terminal_pty import PtySession


def _own_zombies():
    out = subprocess.run(["ps", "-eo", "pid,ppid,stat"], capture_output=True).stdout.decode()
    me = str(os.getpid())
    rows = [line.split() for line in out.splitlines()[1:]]
    return [r for r in rows if len(r) >= 3 and r[1] == me and r[2].startswith("Z")]


@pytest.fixture(autouse=True)
def _no_preexisting_zombies():
    # reap anything an earlier test left, so we measure only our own effect
    try:
        while os.waitpid(-1, os.WNOHANG)[0]:
            pass
    except OSError:
        pass


def test_close_leaves_no_zombie():
    before = len(_own_zombies())
    s = PtySession(cwd="/tmp")
    s.spawn()
    time.sleep(0.2)
    s.close()
    assert len(_own_zombies()) == before, "close() leaked a zombie process"
    assert s.pid is None


def test_repeated_sessions_do_not_accumulate_zombies():
    """The leak was one per session -- it only shows up over a long-lived server."""
    before = len(_own_zombies())
    for _ in range(3):
        s = PtySession(cwd="/tmp")
        s.spawn()
        time.sleep(0.15)
        s.close()
    assert len(_own_zombies()) == before, "zombies accumulated across sessions"


@pytest.mark.parametrize("bad", ["abc", None, {"a": 1}, [1, 2], 99999, -5, 2**40])
def test_resize_never_crashes_on_client_supplied_garbage(bad):
    """resize values come straight from a WS control frame. int('abc') raised ValueError
    at the call site, and rows>65535 raised struct.error (which `except OSError` missed) --
    either killed the whole PTY session."""
    s = PtySession(cwd="/tmp")
    s.spawn()
    time.sleep(0.15)
    try:
        s.resize(bad, 80)          # must not raise
        s.resize(24, bad)
    finally:
        s.close()


def test_child_ignoring_sighup_is_still_reaped():
    """SIGHUP is catchable, so a shell can ignore it. The SIGKILL escalation guarantees
    close() still terminates and reaps rather than hanging or leaking."""
    before = len(_own_zombies())
    s = PtySession(cwd="/tmp", shell="/bin/sh")
    s.spawn()
    os.write(s.fd, b"trap '' HUP; sleep 60\r")
    time.sleep(0.4)
    t0 = time.monotonic()
    s.close()
    elapsed = time.monotonic() - t0
    assert len(_own_zombies()) == before, "a SIGHUP-ignoring child was left as a zombie"
    assert elapsed < 1.0, f"close() blocked the event loop for {elapsed:.2f}s"
