import logging
import os
import sqlite3
import time
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

_MIGRATIONS_DIR = Path(__file__).parent / "migrations"
_conn: Optional[sqlite3.Connection] = None
_current_session_id: Optional[int] = None


def get_db_path() -> str:
    from config import DB_PATH
    return DB_PATH


def connect() -> sqlite3.Connection:
    global _conn
    if _conn is not None:
        return _conn
    path = get_db_path()
    os.makedirs(os.path.dirname(path), exist_ok=True) if os.path.dirname(path) else None
    _conn = sqlite3.connect(path, check_same_thread=False)
    _conn.row_factory = sqlite3.Row
    _conn.execute("PRAGMA journal_mode=WAL")
    _run_migrations(_conn)
    logger.info("db connected: %s", path)
    return _conn


def _run_migrations(conn: sqlite3.Connection):
    for sql_file in sorted(_MIGRATIONS_DIR.glob("*.sql")):
        logger.info("running migration: %s", sql_file.name)
        try:
            conn.executescript(sql_file.read_text())
        except sqlite3.OperationalError as e:
            # migrations re-run on every connect; ALTER TABLE is a no-op the second time
            if "duplicate column" not in str(e).lower():
                raise
    conn.commit()


# session 

def start_session(mode: str = "game", whoop_connected: bool = False) -> int:
    global _current_session_id
    conn = connect()
    cur = conn.execute(
        "INSERT INTO sessions (started_at, mode, whoop_connected) VALUES (?, ?, ?)",
        (time.time(), mode, int(whoop_connected)),
    )
    conn.commit()
    _current_session_id = cur.lastrowid
    logger.info("session started: id=%d", _current_session_id)
    return _current_session_id


def end_session():
    global _current_session_id
    if _current_session_id is None:
        return
    conn = connect()
    conn.execute(
        "UPDATE sessions SET ended_at = ? WHERE id = ?",
        (time.time(), _current_session_id),
    )
    conn.commit()
    logger.info("session ended: id=%d", _current_session_id)
    _current_session_id = None


def current_session_id() -> Optional[int]:
    return _current_session_id


# interventions 

def save_intervention(state: str, source: str, claude_text: str,
                      content_hash: str = None, fallback_used: bool = False) -> int:
    sid = _current_session_id
    if sid is None:
        return -1
    conn = connect()
    cur = conn.execute(
        """INSERT INTO interventions
           (session_id, ts, state, source, content_hash, claude_text, fallback_used)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (sid, time.time(), state, source, content_hash, claude_text, int(fallback_used)),
    )
    conn.commit()
    return cur.lastrowid


# biometric samples 

def save_biometric(hr: float, hrv: float, recovery: float, strain: float, source: str, state: str = None):
    sid = _current_session_id
    if sid is None:
        return
    conn = connect()
    conn.execute(
        "INSERT INTO biometric_samples (session_id, ts, hr, hrv, recovery, strain, source, state) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (sid, time.time(), hr, hrv, recovery, strain, source, state),
    )
    conn.commit()


# session report: aggregated stats for one session (consumed by /api/session/report
# and the exportable HTML report)

def get_session_report(session_id: int = None) -> Optional[dict]:
    conn = connect()
    sid = session_id or _current_session_id
    if sid is None:
        row = conn.execute("SELECT id FROM sessions ORDER BY id DESC LIMIT 1").fetchone()
        if row is None:
            return None
        sid = row["id"]

    session = conn.execute("SELECT * FROM sessions WHERE id = ?", (sid,)).fetchone()
    if session is None:
        return None

    samples = conn.execute(
        "SELECT ts, hr, hrv, recovery, strain, source, state FROM biometric_samples "
        "WHERE session_id = ? ORDER BY ts", (sid,)).fetchall()
    interventions = conn.execute(
        "SELECT ts, state, source, claude_text, fallback_used FROM interventions "
        "WHERE session_id = ? ORDER BY ts", (sid,)).fetchall()

    # each sample is one ~5s loop cycle, so counting samples per state ~ time share
    states, sources = {}, {}
    hrs, hrvs = [], []
    for s in samples:
        if s["state"]:
            states[s["state"]] = states.get(s["state"], 0) + 1
        if s["source"]:
            sources[s["source"]] = sources.get(s["source"], 0) + 1
        if s["hr"]:
            hrs.append(s["hr"])
        if s["hrv"]:
            hrvs.append(s["hrv"])

    ended = session["ended_at"] or (samples[-1]["ts"] if samples else session["started_at"])
    total = len(samples)
    return {
        "session_id": sid,
        "started_at": session["started_at"],
        "ended_at": session["ended_at"],
        "duration_min": round((ended - session["started_at"]) / 60, 1),
        "mode": session["mode"],
        "whoop_connected": bool(session["whoop_connected"]),
        "samples_count": total,
        "state_shares": {k: round(v / total, 3) for k, v in states.items()} if total else {},
        "sources": sources,
        "hr": {"min": round(min(hrs)), "max": round(max(hrs)),
               "avg": round(sum(hrs) / len(hrs))} if hrs else None,
        "hrv": {"min": round(min(hrvs), 1), "max": round(max(hrvs), 1),
                "avg": round(sum(hrvs) / len(hrvs), 1)} if hrvs else None,
        "interventions": [dict(i) for i in interventions],
        "timeline": [{"ts": s["ts"], "hr": s["hr"], "state": s["state"]} for s in samples],
    }


# calibration: personal baselines (typing rhythm, HR, HRV) that survive restarts

def get_calibration(key: str, default: float = None) -> Optional[float]:
    conn = connect()
    row = conn.execute("SELECT value FROM calibration WHERE key = ?", (key,)).fetchone()
    return row["value"] if row else default


def set_calibration(key: str, value: float):
    conn = connect()
    conn.execute(
        "INSERT INTO calibration (key, value, updated_at) VALUES (?, ?, ?) "
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        (key, float(value), time.time()),
    )
    conn.commit()


# session replay: the black-box recording of a coding session

def get_session_timeline(session_id: int = None) -> dict:
    conn = connect()
    sid = session_id or _current_session_id
    if sid is None:
        row = conn.execute("SELECT id FROM sessions ORDER BY started_at DESC LIMIT 1").fetchone()
        if row is None:
            return {"session_id": None, "samples": [], "interventions": []}
        sid = row["id"]
    samples = [dict(r) for r in conn.execute(
        "SELECT ts, hr, hrv, recovery, strain, source, state FROM biometric_samples WHERE session_id = ? ORDER BY ts",
        (sid,)).fetchall()]
    interventions = [dict(r) for r in conn.execute(
        "SELECT ts, state, source, claude_text FROM interventions WHERE session_id = ? ORDER BY ts",
        (sid,)).fetchall()]
    return {"session_id": sid, "samples": samples, "interventions": interventions}


# feedback 

def save_feedback(intervention_id: int, rating: str, comment: str = None):
    conn = connect()
    conn.execute(
        "INSERT INTO feedback (intervention_id, ts, rating, comment) VALUES (?, ?, ?, ?)",
        (intervention_id, time.time(), rating, comment),
    )
    conn.commit()


# apply fix audit 

def save_apply_fix_audit(action: str, file: str = None, range_before: str = None,
                         patch_hash: str = None, reason: str = None):
    sid = _current_session_id
    if sid is None:
        return
    conn = connect()
    conn.execute(
        """INSERT INTO apply_fix_audit
           (session_id, ts, file, range_before, patch_hash, action, reason)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (sid, time.time(), file, range_before, patch_hash, action, reason),
    )
    conn.commit()


# history query 

def get_interventions(since: float = 0.0, limit: int = 50) -> list:
    conn = connect()
    rows = conn.execute(
        """SELECT i.*, s.mode, s.whoop_connected
           FROM interventions i JOIN sessions s ON i.session_id = s.id
           WHERE i.ts > ? ORDER BY i.ts DESC LIMIT ?""",
        (since, limit),
    ).fetchall()
    return [dict(r) for r in rows]
