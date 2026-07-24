CREATE TABLE `sync_cursors` (
	`id` text PRIMARY KEY NOT NULL,
	`replica_id` text NOT NULL,
	`sequence` text NOT NULL,
	`file_hash` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sync_cursors_replica_id` ON `sync_cursors` (`replica_id`);--> statement-breakpoint
CREATE TABLE `sync_errors` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`replica_id` text,
	`sequence` text,
	`domain` text,
	`file_hash` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_sync_errors_created_at` ON `sync_errors` (`created_at`);--> statement-breakpoint
CREATE TABLE `sync_hlc_state` (
	`id` text PRIMARY KEY NOT NULL,
	`physical_ms` text NOT NULL,
	`counter` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_local_meta` (
	`id` text PRIMARY KEY NOT NULL,
	`protocol` text NOT NULL,
	`library_uuid` text NOT NULL,
	`replica_id` text NOT NULL,
	`next_sequence` text DEFAULT '1' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`change_id` text NOT NULL,
	`clock` text NOT NULL,
	`domain` text NOT NULL,
	`state_json` text NOT NULL,
	`segment_sequence` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sync_outbox_change_id` ON `sync_outbox` (`change_id`);--> statement-breakpoint
CREATE INDEX `idx_sync_outbox_clock` ON `sync_outbox` (`clock`);--> statement-breakpoint
CREATE INDEX `idx_sync_outbox_segment_sequence` ON `sync_outbox` (`segment_sequence`);--> statement-breakpoint
CREATE TABLE `sync_prepared_segments` (
	`id` text PRIMARY KEY NOT NULL,
	`sequence` text NOT NULL,
	`path` text NOT NULL,
	`bytes` blob NOT NULL,
	`sha256` text NOT NULL,
	`change_ids_json` text NOT NULL,
	`published_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sync_prepared_segments_sequence` ON `sync_prepared_segments` (`sequence`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sync_prepared_segments_path` ON `sync_prepared_segments` (`path`);--> statement-breakpoint
CREATE INDEX `idx_sync_prepared_segments_published_at` ON `sync_prepared_segments` (`published_at`);
