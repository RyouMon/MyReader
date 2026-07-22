CREATE TABLE `reading_completions` (
	`id` text PRIMARY KEY NOT NULL,
	`book_id` integer NOT NULL,
	`format` text NOT NULL,
	`local_day` text NOT NULL,
	`completed_at` real NOT NULL,
	`updated_at` real NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_reading_completions_book_id` ON `reading_completions` (`book_id`);--> statement-breakpoint
CREATE INDEX `idx_reading_completions_local_day` ON `reading_completions` (`local_day`);--> statement-breakpoint
CREATE TABLE `reading_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`book_id` integer NOT NULL,
	`format` text NOT NULL,
	`local_day` text NOT NULL,
	`started_at` real NOT NULL,
	`duration_seconds` integer DEFAULT 0 NOT NULL,
	`updated_at` real NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_reading_sessions_local_day` ON `reading_sessions` (`local_day`);--> statement-breakpoint
CREATE INDEX `idx_reading_sessions_book_id` ON `reading_sessions` (`book_id`);
