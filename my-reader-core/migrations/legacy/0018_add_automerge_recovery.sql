CREATE TABLE `sync_automerge_generation` (
	-- Non-business singleton ID. The only supported value is "local".
	`id` text PRIMARY KEY NOT NULL,
	-- Active remote generation adopted by this local database.
	`generation_id` text NOT NULL,
	-- Unix timestamp in milliseconds when the active generation changed.
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_automerge_backups` (
	-- 32-character UUID identifying this local recovery backup.
	`id` text PRIMARY KEY NOT NULL,
	-- Remote generation that was active when this backup was created.
	`generation_id` text NOT NULL,
	-- Complete Automerge snapshot saved before adopting another generation.
	`snapshot_bytes` blob NOT NULL,
	-- JSON array of Automerge heads corresponding to snapshot_bytes.
	`heads_json` text NOT NULL,
	-- Unix timestamp in milliseconds when this backup was created.
	`created_at` integer NOT NULL,
	-- Stable machine-readable reason for creating this backup.
	`reason` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_sync_automerge_backups_created_at` ON `sync_automerge_backups` (`created_at`);
