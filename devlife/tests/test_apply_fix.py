import pytest
from httpx import AsyncClient, ASGITransport


def _make_patch(**overrides):
    base = {
        "file": "demo.py",
        "language": "python",
        "range": {"start_line": 1, "end_line": 3},
        "replacement_text": "def foo():\n    return 42\n",
        "rationale": "fixed the return value",
        "severity": "medium",
        "original_text": "def foo():\n    return 0\n",
    }
    base.update(overrides)
    return base


# contract validation (unit)

def test_patch_contract_valid():
    from apply_fix.contract import PatchContract
    p = PatchContract(**_make_patch())
    assert p.file == "demo.py"


def test_patch_rejects_empty_rationale():
    from apply_fix.validator import validate_patch
    from apply_fix.contract import PatchContract
    p = PatchContract(**_make_patch(rationale="   "))
    ok, reason = validate_patch(p)
    assert not ok
    assert "rationale" in reason.lower()


def test_patch_rejects_too_many_lines():
    from apply_fix.validator import validate_patch
    from apply_fix.contract import PatchContract
    big = "\n".join(f"line_{i} = {i}" for i in range(60))
    p = PatchContract(**_make_patch(replacement_text=big))
    ok, reason = validate_patch(p)
    assert not ok
    assert "large" in reason.lower()


def test_patch_rejects_shell_metachar():
    from apply_fix.validator import validate_patch
    from apply_fix.contract import PatchContract
    p = PatchContract(**_make_patch(replacement_text="import os\nos.system('rm -rf /')"))
    ok, reason = validate_patch(p)
    assert not ok


def test_patch_rejects_bad_range():
    from apply_fix.validator import validate_patch
    from apply_fix.contract import PatchContract
    p = PatchContract(**_make_patch(range={"start_line": 10, "end_line": 5}))
    ok, reason = validate_patch(p)
    assert not ok


# HTTP endpoints

@pytest.mark.asyncio
async def test_preview_valid_patch():
    import server
    async with AsyncClient(transport=ASGITransport(app=server.app), base_url="http://test") as client:
        resp = await client.post("/api/apply-fix/preview", json=_make_patch())
    assert resp.status_code == 200
    assert resp.json()["valid"] is True
    assert "patch_hash" in resp.json()


@pytest.mark.asyncio
async def test_preview_rejects_invalid():
    import server
    async with AsyncClient(transport=ASGITransport(app=server.app), base_url="http://test") as client:
        resp = await client.post("/api/apply-fix/preview", json=_make_patch(rationale=""))
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_confirm_and_rollback():
    import server
    async with AsyncClient(transport=ASGITransport(app=server.app), base_url="http://test") as client:
        prev = await client.post("/api/apply-fix/preview", json=_make_patch())
        assert prev.status_code == 200
        patch_hash = prev.json()["patch_hash"]

        conf = await client.post("/api/apply-fix/confirm", json={"patch_hash": patch_hash})
        assert conf.status_code == 200

        roll = await client.post("/api/apply-fix/rollback", json={"patch_hash": patch_hash})
        assert roll.status_code == 200
        assert roll.json()["original_text"] == _make_patch()["original_text"]
