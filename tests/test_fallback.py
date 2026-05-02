import pytest
from unittest.mock import patch
from httpx import AsyncClient, ASGITransport


def test_fallback_returns_valid_intervention():
    from fallback_responses import get_fallback_intervention
    for state in ["RELAXED", "STRESSED", "FATIGUED", "DEEP_FOCUS", "WIRED"]:
        result = get_fallback_intervention(state)
        assert result["type"] == "intervention"
        assert result["message"]
        assert result["reason"] == "fallback"


def test_fallback_unknown_state_uses_relaxed():
    from fallback_responses import get_fallback_intervention
    result = get_fallback_intervention("UNKNOWN_STATE")
    assert result["type"] == "intervention"
    assert result["message"]


def test_mock_biometrics_seeded_reproducible():
    from mock_biometrics import MockBiometrics
    m1 = MockBiometrics(seeded=True)
    m2 = MockBiometrics(seeded=True)
    d1 = m1.get_data()
    d2 = m2.get_data()
    assert d1 == d2


def test_mock_biometrics_set_state_changes_target():
    from mock_biometrics import MockBiometrics
    m = MockBiometrics()
    m.set_state(2)
    assert m.current_preset == 2


def test_mock_biometrics_all_presets_valid():
    from mock_biometrics import MockBiometrics
    m = MockBiometrics()
    for preset in [1, 2, 3, 4, 5]:
        assert m.set_state(preset) is True
        data = m.get_data()
        assert "heartRate" in data
        assert "recovery" in data


@pytest.mark.asyncio
async def test_health_endpoint_online():
    import server
    async with AsyncClient(transport=ASGITransport(app=server.app), base_url="http://test") as client:
        resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "alive"


@pytest.mark.asyncio
async def test_history_endpoint_returns_list():
    import server
    async with AsyncClient(transport=ASGITransport(app=server.app), base_url="http://test") as client:
        resp = await client.get("/api/history")
    assert resp.status_code == 200
    assert "interventions" in resp.json()


@pytest.mark.asyncio
async def test_mock_state_endpoint_validates_range():
    import server
    async with AsyncClient(transport=ASGITransport(app=server.app), base_url="http://test") as client:
        bad = await client.post("/api/biometric/mock", json={"state": 99})
        good = await client.post("/api/biometric/mock", json={"state": 3})
    assert bad.status_code == 422
    assert good.status_code == 200
