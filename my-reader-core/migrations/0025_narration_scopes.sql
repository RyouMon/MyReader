CREATE TABLE narration_scopes (
    id TEXT PRIMARY KEY NOT NULL,
    revision INTEGER NOT NULL,
    settings_json TEXT NOT NULL
);
CREATE TABLE narration_books (
    book_id INTEGER PRIMARY KEY NOT NULL,
    scope_id TEXT NOT NULL REFERENCES narration_scopes(id),
    series_name TEXT
);
CREATE TABLE narration_merge_sources (
    scope_id TEXT NOT NULL REFERENCES narration_scopes(id),
    source_id TEXT NOT NULL,
    source_json TEXT NOT NULL,
    PRIMARY KEY(scope_id, source_id)
);
INSERT INTO narration_scopes(id, revision, settings_json)
SELECT 'book:' || book_id, revision,
    json_set(settings_json, '$.scopeId', 'book:' || book_id)
FROM book_narration;
INSERT INTO narration_books(book_id, scope_id)
SELECT book_id, 'book:' || book_id FROM book_narration;
DROP TABLE book_narration;
ALTER TABLE narration_entries ADD COLUMN scope_id TEXT NOT NULL DEFAULT '';
ALTER TABLE narration_checkpoints ADD COLUMN scope_id TEXT NOT NULL DEFAULT '';
UPDATE narration_entries SET scope_id = (
    SELECT 'book:' || book_id FROM narration_sessions WHERE id = session_id
);
UPDATE narration_checkpoints SET scope_id = (
    SELECT 'book:' || book_id FROM narration_sessions WHERE id = session_id
);
CREATE INDEX narration_scope_books ON narration_books(scope_id);
