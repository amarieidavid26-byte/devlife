import importlib
import os
import pytest
from unittest.mock import patch


def _reload_server():
    import server
    importlib.reload(server)
    return server


# defect: WHOOP callback dead code - exchange_token never runs
@pytest.mark.asyncio
async def test_whoop_callback_happy_path():
    from httpx import AsyncClient, ASGITransport
    import server
    with patch.object(server.bio, "exchange_token", return_value=True) as mock_exchange:
        async with AsyncClient(
            transport=ASGITransport(app=server.app), base_url="http://test"
        ) as client:
            resp = await client.get(
                "/api/whoop/callback?code=fake_code", follow_redirects=False
            )
    assert resp.status_code in (302, 307), f"expected redirect, got {resp.status_code}"
    mock_exchange.assert_called_once()


@pytest.mark.asyncio
async def test_whoop_callback_error_is_400():
    from httpx import AsyncClient, ASGITransport
    import server
    async with AsyncClient(
        transport=ASGITransport(app=server.app), base_url="http://test"
    ) as client:
        resp = await client.get("/api/whoop/callback?error=access_denied")
    assert resp.status_code == 400


# defect: hard-coded redirect URI - must come from config
def test_whoop_redirect_uri_in_config():
    from config import WHOOP_REDIRECT_URI
    assert WHOOP_REDIRECT_URI, "WHOOP_REDIRECT_URI must exist in config"


# defect: PORT override ignores env var
def test_port_respects_env_var():
    os.environ["PORT"] = "9999"
    try:
        srv = _reload_server()
        assert srv.PORT == 9999, f"PORT should be 9999, got {srv.PORT}"
    finally:
        del os.environ["PORT"]
        _reload_server()


# defect: mutable globals not wrapped in AppState
def test_appstate_wraps_globals():
    import server
    assert hasattr(server, "app_state"), "app_state must exist"
    st = server.app_state
    for attr in ("connected_clients", "intervention_history", "suppressed_hashes",
                 "intervention_cooldown_until", "pending_content", "last_intervention_hash"):
        assert hasattr(st, attr), f"AppState missing: {attr}"


# defect: GAME_MODE import-time switch - get_analyzer factory must exist
def test_get_analyzer_factory_exists():
    import server
    assert callable(getattr(server, "get_analyzer", None)), "get_analyzer() must exist"
