"""WHOOP token persistence + OAuth correctness (Phase 1).

The core bug this guards: exchange/refresh used to set tokens in memory only, so the
connection died on restart. These tests prove tokens are written, reloaded, and that
`offline` is re-sent on refresh (WHOOP drops the refresh token otherwise)."""

import json
import time

import biometric_engine
from biometric_engine import BiometricEngine


class _Resp:
    def __init__(self, status_code, payload):
        self.status_code = status_code
        self._payload = payload

    def json(self):
        return self._payload


def test_get_auth_url_has_offline_profile_and_state():
    eng = BiometricEngine("cid", "secret")
    url = eng.get_auth_url("http://localhost:8000/api/whoop/callback", "mystate123")
    assert "offline" in url
    assert "read:profile" in url
    assert "state=mystate123" in url
    assert "client_id=cid" in url


def test_exchange_token_persists(tmp_path, monkeypatch):
    tokens_file = tmp_path / ".whoop_tokens.json"
    monkeypatch.setattr(BiometricEngine, "TOKENS_FILE", str(tokens_file))
    monkeypatch.setattr(
        biometric_engine.httpx, "post",
        lambda *a, **k: _Resp(200, {"access_token": "AT", "refresh_token": "RT", "expires_in": 3600}),
    )
    eng = BiometricEngine("cid", "secret")
    assert eng.exchange_token("code123", "http://localhost:8000/api/whoop/callback") is True
    assert tokens_file.exists()
    saved = json.loads(tokens_file.read_text())
    assert saved["access_token"] == "AT"
    assert saved["refresh_token"] == "RT"


def test_refresh_resends_offline_and_saves(tmp_path, monkeypatch):
    tokens_file = tmp_path / ".whoop_tokens.json"
    monkeypatch.setattr(BiometricEngine, "TOKENS_FILE", str(tokens_file))
    captured = {}

    def fake_post(url, data=None, **kw):
        captured.update(data or {})
        return _Resp(200, {"access_token": "AT2", "refresh_token": "RT2", "expires_in": 3600})

    monkeypatch.setattr(biometric_engine.httpx, "post", fake_post)
    eng = BiometricEngine("cid", "secret")
    eng.refresh_token = "OLD_RT"
    assert eng.refresh_access_token() is True
    assert captured.get("scope") == "offline"
    assert captured.get("grant_type") == "refresh_token"
    assert tokens_file.exists()
    assert json.loads(tokens_file.read_text())["access_token"] == "AT2"


def test_load_tokens_round_trip(tmp_path, monkeypatch):
    tokens_file = tmp_path / ".whoop_tokens.json"
    tokens_file.write_text(json.dumps({
        "access_token": "PERSISTED",
        "refresh_token": "RT",
        "expires_at": time.time() + 9999,
    }))
    monkeypatch.setattr(BiometricEngine, "TOKENS_FILE", str(tokens_file))
    eng = BiometricEngine("cid", "secret")  # __init__ calls _load_tokens
    assert eng.access_token == "PERSISTED"
    assert eng.refresh_token == "RT"
