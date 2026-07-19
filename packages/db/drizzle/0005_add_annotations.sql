CREATE TABLE `annotations` (
	`id` text PRIMARY KEY NOT NULL,
	`book_id` integer NOT NULL,
	`format` text NOT NULL,
	`kind` text NOT NULL,
	`locator_json` text NOT NULL,
	`color` text NOT NULL,
	`note` text,
	`created_at` real NOT NULL,
	`updated_at` real NOT NULL,
	`deleted_at` real
);
--> statement-breakpoint
CREATE INDEX `idx_annotations_book_format` ON `annotations` (`book_id`,`format`);--> statement-breakpoint
CREATE INDEX `idx_annotations_updated_at` ON `annotations` (`updated_at`);
