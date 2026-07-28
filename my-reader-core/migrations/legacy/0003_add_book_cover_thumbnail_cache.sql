CREATE TABLE `book_cover_thumbnail_cache` (
	`id` text PRIMARY KEY NOT NULL,
	`book_id` integer NOT NULL,
	`cover_identity` text NOT NULL,
	`thumbnail_version` text NOT NULL,
	`width_px` integer NOT NULL,
	`height_px` integer NOT NULL,
	`file_name` text NOT NULL,
	`file_size_bytes` integer NOT NULL,
	`created_at` real NOT NULL,
	`updated_at` real NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_book_cover_thumbnail_cache_book_size_version` ON `book_cover_thumbnail_cache` (`book_id`,`width_px`,`height_px`,`thumbnail_version`);
