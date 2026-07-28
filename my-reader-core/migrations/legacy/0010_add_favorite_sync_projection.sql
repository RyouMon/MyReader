ALTER TABLE `favorite_books` ADD `is_favorite` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `favorite_books` ADD `sync_clock` text;
