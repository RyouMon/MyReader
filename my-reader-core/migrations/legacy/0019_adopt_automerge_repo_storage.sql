DROP TABLE `sync_automerge_changes`;
--> statement-breakpoint
DROP TABLE `sync_automerge_generation`;
--> statement-breakpoint
DROP TABLE `sync_automerge_backups`;
--> statement-breakpoint
DROP TABLE `sync_automerge_outbox`;
--> statement-breakpoint
CREATE TABLE `sync_automerge_outbox` (
	-- 32-character UUID identifying this local pending storage write.
	`id` text PRIMARY KEY NOT NULL,
	-- JSON-encoded automerge-repo StorageKey.
	`storage_key_json` text NOT NULL,
	-- Official Automerge incremental-save bytes.
	`bytes` blob NOT NULL,
	-- SHA-256 digest of bytes and the final incremental StorageKey component.
	`sha256` text NOT NULL,
	-- Number of Automerge changes represented by bytes.
	`change_count` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sync_automerge_outbox_storage_key` ON `sync_automerge_outbox` (`storage_key_json`);
--> statement-breakpoint
DROP TABLE `sync_automerge_receipts`;
--> statement-breakpoint
UPDATE `sync_local_meta`
SET `protocol` = 'library-sidecar-automerge-repo'
WHERE `protocol` = 'library-sidecar-automerge';
