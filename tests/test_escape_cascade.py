"""ESC is a cascade: it closes whatever is open, and acts as a pause menu only when
nothing is. The order is load-bearing and easy to break by reordering, so pin it here.

Anti-drift over frontend/src/game/keyboard.js -- same approach as the theme.js palette
check in test_session_report.py.
"""

import re
from pathlib import Path

import pytest

KEYBOARD_JS = Path(__file__).parent.parent / "frontend" / "src" / "game" / "keyboard.js"


@pytest.fixture(scope="module")
def esc_branch():
    src = KEYBOARD_JS.read_text()
    m = re.search(r"if \(e\.key === 'Escape'(?: && !e\.shiftKey)?\) \{(.*?)\n        \}", src, re.S)
    assert m, "could not locate the Escape branch in keyboard.js"
    return m.group(1)


def test_api_keys_modal_closes_before_the_settings_behind_it(esc_branch):
    """The keys modal sits at z-index 10005, above the settings panel at 10001. If ESC
    closed settings first, the modal was left floating over the game with nothing behind
    it -- the cascade must always close the topmost layer."""
    assert "isApiKeysModalOpen()" in esc_branch, "ESC no longer closes the API keys modal"
    assert esc_branch.index("closeApiKeysModal()") < esc_branch.index("settingsMenu.hide()"), \
        "the keys modal must close before the settings panel underneath it"


def test_escape_closes_before_it_opens(esc_branch):
    """Every close/dismiss rung must come before settings.show(), otherwise ESC would
    open the menu on top of an open app instead of closing it."""
    order = [
        "closeApiKeysModal()",
        "settingsMenu.hide()",
        "shortcutsOverlay.hide()",
        "ghost.dismissBubble(true)",
        "closeAllApps()",
        "dashboard.hide()",
    ]
    open_at = esc_branch.index("settingsMenu.show()")
    for rung in order:
        assert rung in esc_branch, f"ESC cascade lost a rung: {rung}"
        assert esc_branch.index(rung) < open_at, f"{rung} must run before settingsMenu.show()"


def test_escape_still_resets_player_when_nothing_is_open(esc_branch):
    """The unconditional closeAllApps() is the safety net that unsticks player/HUD (it is
    what recovered the dead-controls bug). Opening the menu must not replace it."""
    open_at = esc_branch.index("settingsMenu.show()")
    tail = esc_branch[:open_at]
    guarded = re.search(r"if \(activeApp\) \{ closeAllApps\(\); return; \}", tail)
    assert guarded, "the guarded closeAllApps() for an open app went missing"
    # a second, unguarded call must survive after the activeApp guard
    assert tail.count("closeAllApps()") >= 2, "the unconditional reset before show() is gone"


def test_escape_toggles_rather_than_traps(esc_branch):
    """settingsMenu.hide() first means a second ESC closes the menu -- without it ESC
    would reopen the panel forever and trap the user."""
    assert esc_branch.index("settingsMenu.hide()") < esc_branch.index("settingsMenu.show()")


def test_shift_escape_does_not_fall_through_into_the_menu():
    """xterm/monaco close the app themselves and only THEN does the event bubble to
    document -- with activeApp already null. Without the !e.shiftKey guard the cascade
    ran anyway and Shift+Esc closed the terminal *and* opened the settings menu."""
    src = KEYBOARD_JS.read_text()
    assert re.search(r"if \(e\.key === 'Escape' && !e\.shiftKey\)", src), \
        "the ESC cascade must ignore Shift+Esc (that chord belongs to the apps)"


def test_shift_escape_works_even_without_widget_focus():
    """The app's own Shift+Esc handler only fires while xterm/monaco holds focus; a click
    on the title bar left the app uncloseable from the keyboard."""
    src = KEYBOARD_JS.read_text()
    m = re.search(r"if \(activeApp && activeApp\.capturesKeyboard\) \{(.*?)\n        \}", src, re.S)
    assert m, "the capturesKeyboard early-return block is gone"
    assert "e.shiftKey" in m.group(1) and "closeAllApps()" in m.group(1), \
        "capturing apps need a global Shift+Esc escape hatch"


def test_spotify_does_not_capture_the_keyboard():
    """Spotify only set capturesKeyboard to stop 1-5/WASD leaking while typing a link.
    The INPUT guard and `if (activeApp) return` both cover that now, so the flag did
    nothing but swallow ESC -- the overlay div can't take focus, so its local handler
    was never in the event path."""
    src = (Path(__file__).parent.parent / "frontend" / "src" / "apps" / "SpotifyApp.js").read_text()
    assert not re.search(r"this\.capturesKeyboard\s*=\s*true", src), \
        "Spotify must not capture the keyboard -- it makes ESC unreachable"


def test_digit_guard_still_protects_text_fields():
    """This guard is what makes dropping Spotify's capturesKeyboard safe."""
    src = KEYBOARD_JS.read_text()
    m = re.search(r"if \(e\.key >= '1' && e\.key <= '5'\) \{(.*?)applyMockState", src, re.S)
    assert m, "the digit branch moved"
    assert "INPUT" in m.group(1) and "TEXTAREA" in m.group(1), \
        "digits must not be stolen from text fields"


def test_interact_key_does_not_type_itself_into_the_app():
    """E opens the app, the app focuses its text field, and the SAME keystroke's default
    action then typed 'e' into it. Every other branch (digits, ?, Tab, O) already calls
    preventDefault; this one didn't. Notes focuses synchronously so it always showed the
    stray 'e'; the terminal only escaped it by deferring focus 120ms."""
    src = KEYBOARD_JS.read_text()
    m = re.search(r"if \(e\.key\.toLowerCase\(\) === 'e'\) \{(.*?)\n        \}", src, re.S)
    assert m, "the E interact branch moved"
    assert "e.preventDefault()" in m.group(1), \
        "E must preventDefault or it types itself into the app it just opened"


def test_interact_key_is_scoped_to_the_room():
    """`furniture` and `player` are the ROOM's instances, and main.js stops calling
    player.update() outside the room -- so gridX/gridY freeze at the last room position
    and E in the town resolved a room object, opening its app over the town scene."""
    src = KEYBOARD_JS.read_text()
    m = re.search(r"if \(e\.key\.toLowerCase\(\) === 'e'\) \{(.*?)\n        \}", src, re.S)
    assert m, "the E interact branch moved"
    assert "inRoom()" in m.group(1), "E must be scoped to the room scene"
    assert m.group(1).index("inRoom()") < m.group(1).index("getNearbyInteractable"), \
        "the scene guard must run before resolving room furniture"


def test_pause_menu_is_scoped_to_the_room(esc_branch):
    """Town/cafe/cowork own Escape (exit meditation, close panel). Their handlers are
    registered later than wireKeyboard, so ours runs first and their stopPropagation
    cannot save us -- without this guard Escape in the cafe closed the panel AND opened
    the settings menu."""
    assert "inRoom()" in esc_branch, "the pause menu must not open outside the room"
    open_at = esc_branch.index("settingsMenu.show()")
    guard_at = esc_branch.rindex("inRoom()")
    assert guard_at < open_at + 40, "the inRoom() guard must gate settingsMenu.show()"


def test_scene_guard_uses_the_live_scene():
    """A cached scene value would go stale across transitions."""
    src = KEYBOARD_JS.read_text()
    m = re.search(r"const inRoom = \(\) => \{(.*?)\};", src, re.S)
    assert m, "inRoom helper missing"
    assert "getSceneManager()" in m.group(1) and "getCurrentScene()" in m.group(1), \
        "inRoom must read the scene live, not a captured value"


def test_o_shortcut_still_exists():
    """ESC is the discoverable path; O stays as the explicit one."""
    src = KEYBOARD_JS.read_text()
    assert re.search(r"e\.key\.toLowerCase\(\) === 'o'", src), "the O shortcut disappeared"


def test_keybind_labels_stay_in_sync():
    """Both overlays list the same bindings -- they drifted apart before."""
    overlay = (Path(__file__).parent.parent / "frontend" / "src" / "hud" / "ShortcutsOverlay.js").read_text()
    menu = (Path(__file__).parent.parent / "frontend" / "src" / "menu" / "SettingsMenu.js").read_text()
    for src in (overlay, menu):
        assert "'settings.kb_close_app'" in src
        assert "['O', 'settings.kb_settings']" in src
