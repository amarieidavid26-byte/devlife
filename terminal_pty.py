"""A real pseudo-terminal session, bridged to the browser over a WebSocket.

Uses the stdlib `pty` module — no third-party deps. The master fd is registered with
the asyncio loop via add_reader, so shell output is streamed without a busy thread.
Resize is forwarded with TIOCSWINSZ, which makes the kernel deliver SIGWINCH to the
child so full-screen TUIs (vim, htop, less) reflow correctly.

Security is handled by the caller (token + Origin + 127.0.0.1 binding); the shell runs
with the cwd pinned to WORKSPACE_ROOT.
"""

import fcntl
import logging
import os
import pty
import shutil
import signal
import struct
import termios

logger = logging.getLogger(__name__)


class PtySession:
    def __init__(self, cwd, shell=None, env=None):
        self.cwd = cwd
        self.shell = shell or os.environ.get("SHELL", "/bin/zsh")
        self.extra_env = env or {}
        self.pid = None
        self.fd = None
        self._loop = None
        self._on_output = None

    def spawn(self):
        """Fork a child running the user's shell attached to a new pty.

        pty.fork() returns (0, fd) in the child and (pid, master_fd) in the parent.
        The server is multithreaded, so to minimise post-fork work in the child (which
        must avoid non-async-signal-safe calls) we resolve the absolute shell path and
        build the env in the PARENT, then the child only does os.chdir + os.execve
        (a direct syscall, no PATH search / Python-level allocation).
        """
        shell = self.shell if os.path.isabs(self.shell) else (shutil.which(self.shell) or "/bin/sh")
        env = dict(os.environ)
        env["TERM"] = "xterm-256color"
        env.update(self.extra_env)
        argv = [shell, "-i"]
        cwd = self.cwd

        pid, fd = pty.fork()
        if pid == 0:  # child — keep this minimal
            try:
                os.chdir(cwd)
            except Exception:
                pass
            try:
                os.execve(shell, argv, env)
            except Exception:
                os._exit(127)
            os._exit(127)
        # parent
        self.pid = pid
        self.fd = fd
        flags = fcntl.fcntl(fd, fcntl.F_GETFL)
        fcntl.fcntl(fd, fcntl.F_SETFL, flags | os.O_NONBLOCK)
        return self

    def attach_reader(self, loop, on_output):
        """Register the master fd with the asyncio loop. on_output(bytes) is called with
        shell output, or on_output(None) once on EOF (child exit)."""
        self._loop = loop
        self._on_output = on_output
        loop.add_reader(self.fd, self._read_ready)

    def _read_ready(self):
        try:
            data = os.read(self.fd, 65536)
        except BlockingIOError:
            return
        except OSError:
            data = b""  # EIO: child has gone
        if not data:
            self._stop_reading()
            if self._on_output:
                self._on_output(None)
            return
        if self._on_output:
            self._on_output(data)

    def write(self, data: bytes):
        if self.fd is None:
            return
        try:
            os.write(self.fd, data)
        except OSError:
            pass

    def resize(self, rows: int, cols: int):
        if self.fd is None:
            return
        try:
            winsize = struct.pack("HHHH", max(1, rows), max(1, cols), 0, 0)
            fcntl.ioctl(self.fd, termios.TIOCSWINSZ, winsize)
        except OSError:
            pass

    def _stop_reading(self):
        if self._loop is not None and self.fd is not None:
            try:
                self._loop.remove_reader(self.fd)
            except Exception:
                pass

    def close(self):
        """Stop reading, close the master fd, SIGHUP the child and reap it (no zombies)."""
        self._stop_reading()
        if self.fd is not None:
            try:
                os.close(self.fd)
            except OSError:
                pass
            self.fd = None
        if self.pid:
            try:
                os.kill(self.pid, signal.SIGHUP)
            except OSError:
                pass
            try:
                os.waitpid(self.pid, os.WNOHANG)
            except OSError:
                pass
            self.pid = None
