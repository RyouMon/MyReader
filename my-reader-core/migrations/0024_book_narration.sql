CREATE TABLE book_narration (
    book_id INTEGER PRIMARY KEY NOT NULL,
    revision INTEGER NOT NULL,
    settings_json TEXT NOT NULL
);
CREATE TABLE narration_sessions (
    id TEXT PRIMARY KEY NOT NULL,
    book_id INTEGER NOT NULL,
    content_version TEXT NOT NULL,
    epoch INTEGER NOT NULL DEFAULT 0,
    UNIQUE(book_id, content_version)
);
CREATE TABLE narration_entries (
    session_id TEXT NOT NULL REFERENCES narration_sessions(id) ON DELETE CASCADE,
    seq INTEGER NOT NULL,
    cache_key TEXT NOT NULL,
    identity_revision INTEGER NOT NULL,
    position REAL NOT NULL,
    source_key TEXT NOT NULL,
    request_json TEXT NOT NULL,
    plan_json TEXT NOT NULL,
    PRIMARY KEY(session_id, seq),
    UNIQUE(session_id, cache_key)
);
CREATE TABLE narration_checkpoints (
    session_id TEXT NOT NULL REFERENCES narration_sessions(id) ON DELETE CASCADE,
    through_seq INTEGER NOT NULL,
    position REAL NOT NULL,
    identity_revision INTEGER NOT NULL,
    summary TEXT NOT NULL,
    PRIMARY KEY(session_id, through_seq, identity_revision)
);
CREATE INDEX narration_entry_position ON narration_entries(session_id, position, seq);
CREATE INDEX narration_checkpoint_position ON narration_checkpoints(session_id, identity_revision, position);
