"""In-app settings: API keys stored locally in SQLite, applied live, never exposed."""

from fastapi.testclient import TestClient

from persistence import db
import runtime
import security
import server


def _fresh_db(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "get_db_path", lambda: str(tmp_path / "t.db"))
    db._conn = None
    db._current_session_id = None


def _auth():
    return {"X-DevLife-Token": security.SESSION_TOKEN}


def test_setting_roundtrip(tmp_path, monkeypatch):
    _fresh_db(tmp_path, monkeypatch)
    assert db.get_setting("claude_api_key") is None
    db.set_setting("claude_api_key", "sk-ant-test-1234abcd")
    assert db.get_setting("claude_api_key") == "sk-ant-test-1234abcd"
    db.set_setting("claude_api_key", "sk-ant-test-5678efgh")
    assert db.get_setting("claude_api_key") == "sk-ant-test-5678efgh"
    db.delete_setting("claude_api_key")
    assert db.get_setting("claude_api_key") is None


def test_settings_endpoints_require_token(tmp_path, monkeypatch):
    _fresh_db(tmp_path, monkeypatch)
    client = TestClient(server.app)
    assert client.get("/api/settings").status_code == 403
    assert client.post("/api/settings", json={"claude_api_key": "x"}).status_code == 403


def test_settings_response_is_masked(tmp_path, monkeypatch):
    _fresh_db(tmp_path, monkeypatch)
    client = TestClient(server.app)
    secret = "sk-ant-super-secret-value-9999"
    r = client.post("/api/settings", json={"claude_api_key": secret}, headers=_auth())
    assert r.status_code == 200
    for resp in (r, client.get("/api/settings", headers=_auth())):
        body = resp.text
        assert secret not in body
        data = resp.json()
        assert data["claude_api_key"]["configured"] is True
        assert data["claude_api_key"]["source"] == "app"
        assert data["claude_api_key"]["hint"] == "…9999"


def test_settings_apply_to_clients_without_restart(tmp_path, monkeypatch):
    _fresh_db(tmp_path, monkeypatch)
    client = TestClient(server.app)
    old_clients = (runtime.brain.client, runtime.content_analyzer.client)
    try:
        r = client.post("/api/settings",
                        json={"claude_api_key": "sk-ant-test-live-apply-0001"},
                        headers=_auth())
        assert r.status_code == 200
        assert runtime.brain.client is not old_clients[0]
        assert runtime.content_analyzer.client is not old_clients[1]
        assert runtime.inline_completer.enabled is True
        assert runtime.effective_setting("claude_api_key") == "sk-ant-test-live-apply-0001"
    finally:
        db.delete_setting("claude_api_key")
        runtime.apply_settings()


def test_clearing_setting_falls_back_to_env(tmp_path, monkeypatch):
    _fresh_db(tmp_path, monkeypatch)
    monkeypatch.setitem(runtime.SETTINGS_ENV_DEFAULTS, "claude_api_key", "sk-ant-from-env-file-4321")
    client = TestClient(server.app)
    try:
        client.post("/api/settings", json={"claude_api_key": "sk-ant-app-override-8765"}, headers=_auth())
        assert runtime.effective_setting("claude_api_key") == "sk-ant-app-override-8765"

        r = client.post("/api/settings", json={"claude_api_key": ""}, headers=_auth())
        data = r.json()
        assert runtime.effective_setting("claude_api_key") == "sk-ant-from-env-file-4321"
        assert data["claude_api_key"]["source"] == "env"
        assert data["claude_api_key"]["hint"] == "…4321"
    finally:
        db.delete_setting("claude_api_key")
        runtime.apply_settings()


def test_untouched_fields_are_kept(tmp_path, monkeypatch):
    _fresh_db(tmp_path, monkeypatch)
    client = TestClient(server.app)
    try:
        client.post("/api/settings", json={"whoop_client_id": "whoop-id-abcd1234"}, headers=_auth())
        # posting only the secret must not wipe the id
        client.post("/api/settings", json={"whoop_client_secret": "whoop-sec-efgh5678"}, headers=_auth())
        assert runtime.effective_setting("whoop_client_id") == "whoop-id-abcd1234"
        assert runtime.effective_setting("whoop_client_secret") == "whoop-sec-efgh5678"
        assert runtime.bio.client_id == "whoop-id-abcd1234"
        assert runtime.bio.client_secret == "whoop-sec-efgh5678"
    finally:
        db.delete_setting("whoop_client_id")
        db.delete_setting("whoop_client_secret")
        runtime.apply_settings()
