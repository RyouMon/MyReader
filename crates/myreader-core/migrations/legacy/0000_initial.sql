CREATE TABLE `file_state` (
	`id` text PRIMARY KEY NOT NULL,
	`path` text NOT NULL,
	`local_state` text NOT NULL,
	`local_blake3` text,
	`local_size` integer,
	`local_mtime` integer,
	`updated_at` real DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_file_state_path` ON `file_state` (`path`);--> statement-breakpoint
CREATE TABLE `reading_progress` (
	`id` text PRIMARY KEY NOT NULL,
	`book_id` integer NOT NULL,
	`format` text NOT NULL,
	`locator_json` text NOT NULL,
	`updated_at` real NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_reading_progress_book_format` ON `reading_progress` (`book_id`,`format`);--> statement-breakpoint
CREATE TABLE `sync_meta` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sync_meta_key` ON `sync_meta` (`key`);