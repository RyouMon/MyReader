CREATE TABLE `sync_automerge_changes` (
	`id` text PRIMARY KEY NOT NULL,
	`change_hash` text NOT NULL,
	`actor_id` text NOT NULL,
	`actor_sequence` text NOT NULL,
	`bytes` blob NOT NULL,
	`origin` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sync_automerge_changes_hash` ON `sync_automerge_changes` (`change_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sync_automerge_changes_actor_sequence` ON `sync_automerge_changes` (`actor_id`,`actor_sequence`);--> statement-breakpoint
CREATE INDEX `idx_sync_automerge_changes_created_at` ON `sync_automerge_changes` (`created_at`);--> statement-breakpoint
CREATE TABLE `sync_automerge_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`object_path` text NOT NULL,
	`bytes` blob NOT NULL,
	`sha256` text NOT NULL,
	`change_hashes_json` text NOT NULL,
	`published_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sync_automerge_outbox_path` ON `sync_automerge_outbox` (`object_path`);--> statement-breakpoint
CREATE INDEX `idx_sync_automerge_outbox_published_at` ON `sync_automerge_outbox` (`published_at`);--> statement-breakpoint
CREATE TABLE `sync_automerge_projection_meta` (
	`id` text PRIMARY KEY NOT NULL,
	`projection_version` integer NOT NULL,
	`heads_json` text NOT NULL,
	`rebuilt_at` integer
);
--> statement-breakpoint
CREATE TABLE `sync_automerge_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`object_path` text NOT NULL,
	`sha256` text NOT NULL,
	`applied_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sync_automerge_receipts_path` ON `sync_automerge_receipts` (`object_path`);--> statement-breakpoint
CREATE INDEX `idx_sync_automerge_receipts_applied_at` ON `sync_automerge_receipts` (`applied_at`);--> statement-breakpoint
CREATE TABLE `sync_automerge_state` (
	`id` text PRIMARY KEY NOT NULL,
	`schema_version` integer NOT NULL,
	`snapshot_bytes` blob NOT NULL,
	`heads_json` text NOT NULL,
	`updated_at` integer NOT NULL
);
