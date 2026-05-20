"""Tests for the privileged-endpoint security primitives (Phase 0)."""

import security
from config import ALLOWED_ORIGINS, WORKSPACE_ROOT


class _FakeWS:
    def __init__(self, origin):
        self.headers = {"origin": origin} if origin is not None else {}


def test_resolve_in_workspace_allows_inside():
    p = security.resolve_in_workspace("sub/dir/file.py")
    assert str(p).startswith(WORKSPACE_ROOT)


def test_resolve_in_workspace_allows_root():
    p = security.resolve_in_workspace("")
    assert str(p) == str(WORKSPACE_ROOT)


def test_resolve_in_workspace_blocks_traversal():
    for bad in ["../../../../etc/passwd", "/etc/passwd", "..", "sub/../../escape"]:
        try:
            security.resolve_in_workspace(bad)
            assert False, f"should have blocked {bad!r}"
        except PermissionError:
            pass


def test_verify_token():
    assert security.verify_token(security.SESSION_TOKEN) is True
    assert security.verify_token("wrong") is False
    assert security.verify_token("") is False
    assert security.verify_token(None) is False


def test_check_origin():
    allowed = ALLOWED_ORIGINS[0]
    assert security.check_origin(_FakeWS(allowed)) is True
    assert security.check_origin(_FakeWS("http://evil.example.com")) is False
    # non-browser client with no Origin header is allowed (token still gates privileged ops)
    assert security.check_origin(_FakeWS(None)) is True


def test_csrf_state_single_use():
    s = security.new_state()
    assert security.consume_state(s) is True
    assert security.consume_state(s) is False  # reuse rejected
    assert security.consume_state("never-issued") is False
    assert security.consume_state(None) is False
