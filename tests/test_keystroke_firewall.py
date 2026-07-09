from terminal_pty import KeystrokeFirewall

from content_analyzer import ContentAnalyzer

_ca = ContentAnalyzer.__new__(ContentAnalyzer)


def _risky_only(line):
    risky, desc = _ca.detect_risky_commands(line)
    return desc if risky else None


def _type(fw, s):
    out, blocked = fw.filter(s.encode())
    return out, blocked


def test_risky_enter_is_swallowed_and_line_killed():
    fw = KeystrokeFirewall(_risky_only)
    out, blocked = _type(fw, "git push --force\r")
    assert len(blocked) == 1
    assert b"\r" not in out          # Enter never reaches the shell
    assert out.endswith(b"\x15")     # replaced with Ctrl-U (kill-line)


def test_safe_command_passes_through():
    fw = KeystrokeFirewall(_risky_only)
    out, blocked = _type(fw, "ls -la\r")
    assert blocked == []
    assert out == b"ls -la\r"


def test_backspace_editing_tracked():
    fw = KeystrokeFirewall(_risky_only)
    # types "rm -rf x", erases it all, types "ls" -> safe
    seq = "rm -rf x" + "\x7f" * 8 + "ls\r"
    out, blocked = _type(fw, seq)
    assert blocked == []


def test_ctrl_c_clears_pending_line():
    fw = KeystrokeFirewall(_risky_only)
    _type(fw, "git push --force")
    _type(fw, "\x03")          # Ctrl-C abandons the line
    out, blocked = _type(fw, "\r")
    assert blocked == []


def test_block_gate_respects_callback():
    # simulates the RELAXED state: the server callback returns None -> nothing blocked
    fw = KeystrokeFirewall(lambda line: None)
    out, blocked = _type(fw, "git push --force\r")
    assert blocked == []
    assert out == b"git push --force\r"


def test_paste_of_two_commands_blocks_only_risky():
    fw = KeystrokeFirewall(_risky_only)
    out, blocked = _type(fw, "ls\rgit push --force\r")
    assert len(blocked) == 1
    assert out.startswith(b"ls\r")
    assert out.endswith(b"\x15")
