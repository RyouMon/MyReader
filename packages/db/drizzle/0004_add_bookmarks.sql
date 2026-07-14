CREATE TABLE `bookmarks` (
	`id` text PRIMARY KEY NOT NULL,
	`book_id` integer NOT NULL,
	`format` text NOT NULL,
	`locator_key` text NOT NULL,
	`locator_json` text NOT NULL,
	`created_at` real NOT NULL,
	`updated_at` real NOT NULL,
	`deleted_at` real
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_bookmarks_book_format_locator` ON `bookmarks` (`book_id`,`format`,`locator_key`);--> statement-breakpoint
CREATE INDEX `idx_bookmarks_updated_at` ON `bookmarks` (`updated_at`);
