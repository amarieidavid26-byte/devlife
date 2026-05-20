"""'Open in full VS Code' (code-server) endpoint: gating + graceful degradation (Phase 4)."""

from fastapi.testclient import TestClient

import server
import security


def test_codeserver_requires_token():
    client = TestClient(server.app)
    assert client.post("/api/codeserver/start").status_code == 403


def test_codeserver_404_when_disabled(monkeypatch):
    # when CODE_SERVER_ENABLED is off, the route is a no-op 404 (fail-safe on hosted deploys)
    monkeypatch.setattr(server, "CODE_SERVER_ENABLED", False)
    client = TestClient(server.app)
    r = client.post("/api/codeserver/start", headers={"X-DevLife-Token": security.SESSION_TOKEN})
    assert r.status_code == 404


def test_codeserver_enabled_but_not_installed(monkeypatch):
    # enabled + binary missing → 503 with an install hint (graceful)
    monkeypatch.setattr(server, "CODE_SERVER_ENABLED", True)
    monkeypatch.setattr(server.code_server, "available", lambda: False)
    client = TestClient(server.app)
    r = client.post("/api/codeserver/start", headers={"X-DevLife-Token": security.SESSION_TOKEN})
    assert r.status_code == 503
    assert "install" in r.json().get("hint", "").lower()
