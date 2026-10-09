-- External Calibre schema, independent of MyReader's SeaORM entities.
-- https://github.com/kovidgoyal/calibre/blob/131c5bcfedc34c767bed2dc83915f68b90ebc537/resources/metadata_sqlite.sql
CREATE TABLE books (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL DEFAULT 'Unknown' COLLATE NOCASE,
    sort TEXT COLLATE NOCASE,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    pubdate TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    series_index REAL NOT NULL DEFAULT 1.0,
    author_sort TEXT COLLATE NOCASE,
    path TEXT NOT NULL DEFAULT '',
    uuid TEXT,
    has_cover BOOL DEFAULT 0,
    last_modified TIMESTAMP NOT NULL DEFAULT '2000-01-01 00:00:00+00:00'
);
