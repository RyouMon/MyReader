CREATE TABLE `pending_book_imports` (
  `book_uuid` text PRIMARY KEY NOT NULL,
  `book_id` integer NOT NULL UNIQUE,
  `title` text NOT NULL,
  `authors_json` text NOT NULL,
  `format` text NOT NULL,
  `size` integer NOT NULL,
  `sha256` text NOT NULL,
  `relative_path` text NOT NULL UNIQUE,
  `recorded_at_ms` integer NOT NULL,
  `created_at` real NOT NULL,
  `attempt_count` integer DEFAULT 0 NOT NULL,
  `last_error` text
);
