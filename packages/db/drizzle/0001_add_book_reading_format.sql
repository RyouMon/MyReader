CREATE TABLE `book_reading_format` (
	`id` text PRIMARY KEY NOT NULL,
	`book_id` integer NOT NULL,
	`reading_format` text NOT NULL,
	`updated_at` real DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_book_reading_format_book_id` ON `book_reading_format` (`book_id`);