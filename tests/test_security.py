"""Tests for the privileged-endpoint security primitives."""

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


def test_csrf_state_survives_reload():
    # the point of the stateless design: a state issued before a dev-server reload (which wipes
    # all module-level dicts) must still validate after it
    s = security.new_state()
    security._consumed_csrf_states.clear()
    assert security.consume_state(s) is True


def test_csrf_state_rejects_tampering():
    ts, nonce, sig = security.new_state().split(".")
    flipped = ("0" if sig[0] != "0" else "1") + sig[1:]
    assert security.consume_state(f"{ts}.{nonce}.{flipped}") is False
    assert security.consume_state(f"{ts}.x{nonce}.{sig}") is False
    # non-ASCII in the signature segment must be rejected, not raise from compare_digest
    assert security.consume_state(f"{ts}.{nonce}.ééé") is False


def test_csrf_state_rejects_expired_and_future():
    import hashlib
    import hmac
    import time

    def signed(issued):
        payload = f"{issued}.nonce"
        sig = hmac.new(security._csrf_key(), payload.encode(), hashlib.sha256).hexdigest()[:32]
        return f"{payload}.{sig}"

    assert security.consume_state(signed(int(time.time()) - security._CSRF_TTL_SECONDS - 1)) is False
    assert security.consume_state(signed(int(time.time()) + 120)) is False
    assert security.consume_state(signed("not-a-timestamp")) is False
