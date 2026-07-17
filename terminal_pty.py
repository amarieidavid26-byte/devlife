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
import time

logger = logging.getLogger(__name__)


class KeystrokeFirewall:
    """Server-side mirror of the typed input line (defense in depth for the Fatigue
    Firewall). The browser terminal already intercepts risky commands in the UI, but a
    client talking to the WebSocket directly would bypass that — this catches the Enter
    key BEFORE it reaches the shell and replaces it with Ctrl-U (kill-line), so the
    command never executes.

    You cannot fully mirror a shell's line editor from the byte stream, so the mirror
    tracks what it can and refuses to guess at the rest:

    - cursor moves (arrows/Home/End) do not change the text, so the mirror is kept as-is.
      Clearing on a bare ESC used to hand over a complete bypass: an arrow is `ESC [ D`,
      the ESC wiped the mirror while the shell only moved the cursor, and the risky
      command still on the line then sailed through Enter.
    - bracketed paste content IS knowable, so it goes into the mirror.
    - history recall (up/down, Ctrl-R), yank (Ctrl-Y) and completion (Tab) replace the
      line with text we never saw. The mirror is marked untrusted and the check is asked
      to decide with unknown=True -- fail closed, never fail open.
    """

    ENTER = (0x0D, 0x0A)
    BACKSPACE = (0x7F, 0x08)
    CTRL_C, CTRL_U, ESC = 0x03, 0x15, 0x1B
    TAB, CTRL_R, CTRL_Y = 0x09, 0x12, 0x19
    CURSOR_FINALS = (0x43, 0x44, 0x48, 0x46)  # C, D, H, F -- right/left/home/end
    PASTE_START, PASTE_END = b"\x1b[200~", b"\x1b[201~"

    def __init__(self, block_reason_fn):
        # block_reason_fn(line, unknown=False) -> reason string to block, else None
        self._blocked_check = block_reason_fn
        self._buf = bytearray()
        self._unknown = False   # the mirror no longer reflects the shell's real line
        self._esc = None        # bytes of the escape sequence currently being parsed
        self._paste = False

    def _reset_line(self):
        self._buf.clear()
        self._unknown = False

    def _esc_complete(self):
        e = self._esc
        if len(e) < 2:
            return False
        if e[1] == 0x5B:                      # '[' CSI: ends on a final byte 0x40-0x7E
            return len(e) > 2 and 0x40 <= e[-1] <= 0x7E
        if e[1] == 0x4F:                      # 'O' SS3: one byte follows
            return len(e) >= 3
        return True                           # ESC + a single byte

    def _classify_esc(self, seq: bytes):
        if seq == self.PASTE_START:
            self._paste = True
            return
        if seq == self.PASTE_END:
            self._paste = False
            return
        if len(seq) >= 3 and seq[1] in (0x5B, 0x4F) and seq[-1] in self.CURSOR_FINALS:
            return                            # cursor only -- the text is unchanged
        self._unknown = True                  # up/down history, or anything we don't model

    def filter(self, data: bytes):
        """Returns (bytes_to_write_to_pty, list_of_block_reasons)."""
        out = bytearray()
        blocked = []
        for b in data:
            if self._esc is not None:
                self._esc.append(b)
                if self._esc_complete():
                    self._classify_esc(bytes(self._esc))
                    self._esc = None
                out.append(b)
                continue

            if b == self.ESC:
                self._esc = bytearray([b])
                out.append(b)
                continue

            if self._paste:
                # a newline inside a bracketed paste is inserted, not executed
                if 32 <= b < 127:
                    self._buf.append(b)
                out.append(b)
                continue

            if b in self.ENTER:
                line = self._buf.decode(errors="ignore").strip()
                unknown = self._unknown
                self._reset_line()
                reason = None
                if unknown:
                    reason = self._blocked_check(line, unknown=True)
                elif line:
                    reason = self._blocked_check(line)
                if reason:
                    out.append(self.CTRL_U)  # clear the shell's pending line instead of running it
                    blocked.append(reason)
                    continue
                out.append(b)
            elif b in self.BACKSPACE:
                if self._buf:
                    self._buf.pop()
                out.append(b)
            elif b in (self.CTRL_C, self.CTRL_U):
                self._reset_line()
                out.append(b)
            elif b in (self.TAB, self.CTRL_R, self.CTRL_Y):
                self._unknown = True
                out.append(b)
            elif 32 <= b < 127:
                self._buf.append(b)
                out.append(b)
            else:
                out.append(b)
        return bytes(out), blocked


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

    def resize(self, rows, cols):
        if self.fd is None:
            return
        # client-controlled: "abc"/None/dict ar arunca la int(), iar >65535 ar arunca
        # struct.error (nu OSError) -> ambele omorau sesiunea PTY. Coerceste si limiteaza.
        try:
            rows = int(rows)
            cols = int(cols)
        except (TypeError, ValueError):
            return
        rows = max(1, min(rows, 5000))
        cols = max(1, min(cols, 5000))
        try:
            winsize = struct.pack("HHHH", rows, cols, 0, 0)
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
            self._reap()
            self.pid = None

    def _reap(self):
        """Asteapta copilul si il culege.

        `waitpid(WNOHANG)` chemat imediat dupa SIGHUP returneaza aproape mereu (0, 0) --
        copilul nu a apucat sa moara -- deci nu culegea nimic si fiecare sesiune de
        terminal lasa in urma un zombie. Serverul e long-running: PID-urile se termina.
        """
        deadline = time.monotonic() + 0.2
        while time.monotonic() < deadline:
            try:
                pid, _ = os.waitpid(self.pid, os.WNOHANG)
                if pid:
                    return
            except ChildProcessError:
                return                      # deja cules
            except OSError:
                return
            time.sleep(0.005)
        # nu a murit la SIGHUP; SIGKILL nu poate fi ignorat, deci waitpid-ul blocant
        # de dupa el e garantat scurt
        try:
            os.kill(self.pid, signal.SIGKILL)
            os.waitpid(self.pid, 0)
        except OSError:
            pass
