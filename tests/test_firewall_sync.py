import re
from pathlib import Path

from content_analyzer import RISKY_COMMAND_PATTERNS, ContentAnalyzer

TERMINAL_JS = Path(__file__).resolve().parent.parent / "frontend" / "src" / "apps" / "Terminal.js"

SAMPLES = [
    "rm -rf /tmp/build",
    "git push --force origin main",
    "git push -f",
    "DROP TABLE users;",
    "chmod 777 /etc/passwd",
    "sudo rm /var/log/syslog",
    "git reset --hard HEAD~3",
    "DELETE FROM users",
    "docker rm -f api",
    "npm publish",
]


def _js_patterns():
    src = TERMINAL_JS.read_text()
    block = src.split("RISKY_PATTERNS = [", 1)[1].split("];", 1)[0]
    return re.findall(r"\[/(.+?)/i,", block)


def test_js_patterns_extracted():
    assert len(_js_patterns()) >= 10


def test_js_firewall_patterns_match_backend():
    # the terminal firewall (frontend) must never drift from the backend list;
    # the backend may have extra patterns (e.g. the anchored 'env')
    py = {p for p, _ in RISKY_COMMAND_PATTERNS}
    for js in _js_patterns():
        assert js in py, f"Terminal.js pattern drifted from content_analyzer: {js}"


def test_dangerous_commands_trigger_both_sides():
    ca = ContentAnalyzer.__new__(ContentAnalyzer)  # skip Anthropic client init
    js = _js_patterns()
    for cmd in SAMPLES:
        risky, _ = ca.detect_risky_commands(cmd)
        assert risky, f"backend missed: {cmd}"
        assert any(re.search(p, cmd, re.IGNORECASE | re.MULTILINE) for p in js), f"frontend missed: {cmd}"
