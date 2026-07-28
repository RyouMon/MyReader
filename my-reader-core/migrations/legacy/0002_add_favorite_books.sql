CREATE TABLE `favorite_books` (
	`id` text PRIMARY KEY NOT NULL,
	`book_id` integer NOT NULL,
	`added_at` real DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_favorite_books_book_id` ON `favorite_books` (`book_id`);
