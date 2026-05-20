"""Workspace file operations for the in-game IDE.

Every path goes through security.resolve_in_workspace, so nothing can read or write
outside WORKSPACE_ROOT (symlink escapes included). The browser is a thin client; this
local backend does the real disk I/O — the code-server model.
"""

import logging
import os
import shutil
from pathlib import Path

import security
from config import WORKSPACE_ROOT

logger = logging.getLogger(__name__)

MAX_READ_BYTES = 2 * 1024 * 1024  # don't ship giant files into the browser editor
IGNORE_NAMES = {".git", "node_modules", "__pycache__", ".venv", "venv", ".DS_Store", "dist"}

EXT_LANG = {
    ".py": "python", ".js": "javascript", ".jsx": "javascript", ".mjs": "javascript",
    ".ts": "typescript", ".tsx": "typescript", ".json": "json", ".md": "markdown",
    ".html": "html", ".htm": "html", ".css": "css", ".scss": "scss", ".less": "less",
    ".go": "go", ".c": "c", ".h": "c", ".cpp": "cpp", ".cc": "cpp", ".hpp": "cpp",
    ".rs": "rust", ".java": "java", ".rb": "ruby", ".php": "php", ".sh": "shell",
    ".yml": "yaml", ".yaml": "yaml", ".toml": "toml", ".ini": "ini", ".sql": "sql",
    ".xml": "xml", ".txt": "plaintext", ".env": "plaintext", ".cfg": "plaintext",
}


def _root() -> Path:
    return Path(WORKSPACE_ROOT).resolve()


def _rel(p: Path) -> str:
    root = _root()
    return "" if p == root else str(p.relative_to(root))


def guess_language(name: str) -> str:
    return EXT_LANG.get(os.path.splitext(name)[1].lower(), "plaintext")


def list_dir(rel: str = "") -> dict:
    target = security.resolve_in_workspace(rel)
    if not target.is_dir():
        raise NotADirectoryError(rel)
    entries = []
    for child in sorted(target.iterdir(), key=lambda p: (p.is_file(), p.name.lower())):
        if child.name in IGNORE_NAMES:
            continue
        entries.append({
            "name": child.name,
            "path": _rel(child),
            "type": "dir" if child.is_dir() else "file",
        })
    return {"path": _rel(target), "entries": entries}


def read_file(rel: str) -> dict:
    target = security.resolve_in_workspace(rel)
    if not target.is_file():
        raise FileNotFoundError(rel)
    if target.stat().st_size > MAX_READ_BYTES:
        raise ValueError("file too large to open in the editor")
    raw = target.read_bytes()
    if b"\x00" in raw[:8192]:
        raise ValueError("binary file")
    return {
        "path": _rel(target),
        "content": raw.decode("utf-8", errors="replace"),
        "language": guess_language(target.name),
    }


def write_file(rel: str, content: str) -> dict:
    target = security.resolve_in_workspace(rel)
    if target.is_dir():
        raise IsADirectoryError(rel)
    target.parent.mkdir(parents=True, exist_ok=True)
    tmp = target.with_name(target.name + ".tmp~")
    tmp.write_text(content, encoding="utf-8")
    os.replace(tmp, target)  # atomic
    return {"path": _rel(target), "bytes": len(content.encode("utf-8"))}


def create(rel: str, kind: str = "file") -> dict:
    target = security.resolve_in_workspace(rel)
    if kind == "dir":
        target.mkdir(parents=True, exist_ok=True)
    else:
        target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists():
            target.write_text("", encoding="utf-8")
    return {"path": _rel(target), "type": kind}


def rename(src: str, dst: str) -> dict:
    s = security.resolve_in_workspace(src)
    d = security.resolve_in_workspace(dst)
    d.parent.mkdir(parents=True, exist_ok=True)
    os.replace(s, d)
    return {"path": _rel(d)}


def delete(rel: str) -> dict:
    target = security.resolve_in_workspace(rel)
    if target == _root():
        raise PermissionError("cannot delete the workspace root")
    if target.is_dir():
        shutil.rmtree(target)
    else:
        target.unlink(missing_ok=True)
    return {"ok": True}
