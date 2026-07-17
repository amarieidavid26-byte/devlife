from terminal_pty import KeystrokeFirewall

from content_analyzer import ContentAnalyzer

_ca = ContentAnalyzer.__new__(ContentAnalyzer)


UNINSPECTABLE = "recalled or completed line — the firewall cannot inspect it"


def _risky_only(line, unknown=False):
    # mirrors server.py's _block_reason: when the mirror is untrusted the honest answer
    # is to block, because the real line is not the one we saw
    if unknown:
        return UNINSPECTABLE
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
    fw = KeystrokeFirewall(lambda line, unknown=False: None)
    out, blocked = _type(fw, "git push --force\r")
    assert blocked == []
    assert out == b"git push --force\r"


def test_paste_of_two_commands_blocks_only_risky():
    fw = KeystrokeFirewall(_risky_only)
    out, blocked = _type(fw, "ls\rgit push --force\r")
    assert len(blocked) == 1
    assert out.startswith(b"ls\r")
    assert out.endswith(b"\x15")


# --- bypasses: each of these used to let a risky command reach the shell ------------
# A bare ESC used to clear the mirror. Every cursor key is an ESC-prefixed sequence, so
# one arrow keypress wiped the firewall's view while the shell kept the risky line.


def test_cursor_keys_do_not_wipe_the_mirror():
    """Left/Right only move the cursor -- the text is unchanged, so the mirror must be
    kept. Clearing on the ESC byte was a complete bypass."""
    fw = KeystrokeFirewall(_risky_only)
    _type(fw, "git push --force")
    _type(fw, "\x1b[D")            # Left
    _type(fw, "\x1b[C")            # Right -- cursor is back where it started
    out, blocked = _type(fw, "\r")
    assert len(blocked) == 1, "arrow keys let a risky command through"
    assert b"\r" not in out


def test_home_and_end_do_not_wipe_the_mirror():
    fw = KeystrokeFirewall(_risky_only)
    _type(fw, "git push --force")
    _type(fw, "\x1b[H")
    _type(fw, "\x1b[F")
    _, blocked = _type(fw, "\r")
    assert len(blocked) == 1


def test_history_recall_is_blocked_because_it_cannot_be_inspected():
    """Up-arrow replaces the line with text we never saw. Against an empty mirror this
    used to run ANY previously-typed risky command with zero inspection."""
    fw = KeystrokeFirewall(_risky_only)
    _type(fw, "\x1b[A")
    out, blocked = _type(fw, "\r")
    assert blocked == [UNINSPECTABLE]
    assert b"\r" not in out


def test_bracketed_paste_content_is_inspected():
    """Pasted text IS knowable, so it belongs in the mirror -- and the block names the
    real reason rather than falling back to 'cannot inspect'."""
    fw = KeystrokeFirewall(_risky_only)
    _type(fw, "\x1b[200~git push --force\x1b[201~")
    out, blocked = _type(fw, "\r")
    assert len(blocked) == 1
    assert blocked[0] != UNINSPECTABLE, "paste content is knowable; inspect it"
    assert b"\r" not in out


def test_harmless_paste_still_runs():
    fw = KeystrokeFirewall(_risky_only)
    _type(fw, "\x1b[200~ls -la\x1b[201~")
    out, blocked = _type(fw, "\r")
    assert blocked == []
    assert out.endswith(b"\r")


def test_newline_inside_a_paste_is_not_an_enter():
    """zsh inserts a pasted newline as text, it does not execute -- so the firewall must
    not treat it as an Enter either."""
    fw = KeystrokeFirewall(_risky_only)
    out, blocked = _type(fw, "\x1b[200~ls\rgit push --force\x1b[201~")
    assert blocked == [], "a newline inside bracketed paste must not trigger the check"


def test_yank_and_completion_are_blocked():
    for keys, label in [("\x19", "Ctrl-Y yank"), ("\x12", "Ctrl-R search"), ("\t", "Tab completion")]:
        fw = KeystrokeFirewall(_risky_only)
        _type(fw, "rm -rf /tm")
        _type(fw, keys)
        _, blocked = _type(fw, "\r")
        assert blocked == [UNINSPECTABLE], f"{label} left the mirror trusted"


def test_cursor_edit_of_a_harmless_line_is_not_a_false_positive():
    """Fail-closed must not mean unusable: normal editing of a safe command still runs."""
    fw = KeystrokeFirewall(_risky_only)
    _type(fw, "ls -la")
    _type(fw, "\x1b[D")
    _type(fw, "\x1b[C")
    out, blocked = _type(fw, "\r")
    assert blocked == []
    assert out.endswith(b"\r")


def test_ctrl_c_clears_the_untrusted_flag_too():
    """Ctrl-C abandons the line entirely, so the next one starts clean -- otherwise one
    up-arrow would poison every command for the rest of the session."""
    fw = KeystrokeFirewall(_risky_only)
    _type(fw, "\x1b[A")            # mirror now untrusted
    _type(fw, "\x03")              # Ctrl-C -- fresh line
    out, blocked = _type(fw, "ls\r")
    assert blocked == []
    assert out.endswith(b"ls\r")
