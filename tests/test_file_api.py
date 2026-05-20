"""Workspace file API (Phase 3): I/O round-trips, traversal guard, route token gating."""

import pytest
from fastapi.testclient import TestClient

import file_api
import security
import server


@pytest.fixture
def ws(tmp_path, monkeypatch):
    # point both the resolver and the file API at a throwaway workspace
    monkeypatch.setattr(security, "WORKSPACE_ROOT", str(tmp_path))
    monkeypatch.setattr(file_api, "WORKSPACE_ROOT", str(tmp_path))
    return tmp_path


def test_write_read_roundtrip(ws):
    file_api.write_file("sub/hello.py", "print('hi')\n")
    assert (ws / "sub" / "hello.py").read_text() == "print('hi')\n"
    r = file_api.read_file("sub/hello.py")
    assert r["content"] == "print('hi')\n"
    assert r["language"] == "python"
    assert r["path"] == "sub/hello.py"


def test_list_dir(ws):
    file_api.write_file("a.txt", "x")
    file_api.create("d", "dir")
    names = {e["name"] for e in file_api.list_dir("")["entries"]}
    assert "a.txt" in names and "d" in names


def test_traversal_blocked(ws):
    with pytest.raises(PermissionError):
        file_api.read_file("../../../etc/passwd")
    with pytest.raises(PermissionError):
        file_api.write_file("../escape.txt", "x")


def test_rename_and_delete(ws):
    file_api.write_file("old.txt", "data")
    file_api.rename("old.txt", "new.txt")
    assert (ws / "new.txt").exists() and not (ws / "old.txt").exists()
    file_api.delete("new.txt")
    assert not (ws / "new.txt").exists()


def test_binary_refused(ws):
    (ws / "bin.dat").write_bytes(b"\x00\x01\x02ELF")
    with pytest.raises(ValueError):
        file_api.read_file("bin.dat")


# --- route-level: token gating ---

def test_files_route_requires_token():
    client = TestClient(server.app)
    assert client.get("/api/files/tree").status_code == 403


def test_files_route_with_token_ok():
    client = TestClient(server.app)
    r = client.get("/api/files/tree", headers={"X-DevLife-Token": security.SESSION_TOKEN})
    assert r.status_code == 200
    assert "entries" in r.json()


def test_files_route_traversal_blocked():
    client = TestClient(server.app)
    r = client.get("/api/files/read", params={"path": "../../../etc/passwd"},
                   headers={"X-DevLife-Token": security.SESSION_TOKEN})
    assert r.status_code == 403
