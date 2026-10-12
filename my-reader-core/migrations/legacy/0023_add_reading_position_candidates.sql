CREATE TABLE reading_position_candidates (
  book_id INTEGER NOT NULL,
  format TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  locator_json TEXT NOT NULL,
  display_progression REAL,
  recorded_at INTEGER NOT NULL,
  replica_id TEXT NOT NULL,
  PRIMARY KEY (book_id, format, operation_id)
);
