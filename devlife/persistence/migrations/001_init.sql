CREATE TABLE IF NOT EXISTS sessions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at  REAL    NOT NULL,
    ended_at    REAL,
    mode        TEXT    NOT NULL DEFAULT 'game',
    whoop_connected INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS interventions (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id    INTEGER NOT NULL REFERENCES sessions(id),
    ts            REAL    NOT NULL,
    state         TEXT    NOT NULL,
    source        TEXT    NOT NULL,
    content_hash  TEXT,
    claude_text   TEXT,
    fallback_used INTEGER NOT NULL DEFAULT 0,
    suppressed    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS biometric_samples (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES sessions(id),
    ts         REAL    NOT NULL,
    hr         REAL,
    hrv        REAL,
    recovery   REAL,
    strain     REAL,
    source     TEXT
);

CREATE TABLE IF NOT EXISTS feedback (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    intervention_id INTEGER NOT NULL REFERENCES interventions(id),
    ts              REAL    NOT NULL,
    rating          TEXT,
    comment         TEXT
);

CREATE TABLE IF NOT EXISTS apply_fix_audit (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES sessions(id),
    ts         REAL    NOT NULL,
    file       TEXT,
    range_before TEXT,
    patch_hash TEXT,
    action     TEXT    NOT NULL,
    reason     TEXT
);

CREATE TABLE IF NOT EXISTS consent (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    ts                  REAL    NOT NULL,
    granted_scopes_json TEXT    NOT NULL
);
