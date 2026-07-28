ALTER TABLE `bookmarks` DROP COLUMN `sync_clock`;--> statement-breakpoint
ALTER TABLE `favorite_books` DROP COLUMN `sync_clock`;--> statement-breakpoint
ALTER TABLE `reading_progress` DROP COLUMN `sync_clock`;--> statement-breakpoint
ALTER TABLE `sync_local_meta` DROP COLUMN `next_sequence`;
