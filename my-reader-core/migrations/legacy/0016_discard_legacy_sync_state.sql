DELETE FROM `sync_automerge_changes`
WHERE EXISTS (
	SELECT 1 FROM `sync_local_meta`
	WHERE `protocol` <> 'library-sidecar-automerge'
);
--> statement-breakpoint
DELETE FROM `sync_automerge_outbox`
WHERE EXISTS (
	SELECT 1 FROM `sync_local_meta`
	WHERE `protocol` <> 'library-sidecar-automerge'
);
--> statement-breakpoint
DELETE FROM `sync_automerge_projection_meta`
WHERE EXISTS (
	SELECT 1 FROM `sync_local_meta`
	WHERE `protocol` <> 'library-sidecar-automerge'
);
--> statement-breakpoint
DELETE FROM `sync_automerge_receipts`
WHERE EXISTS (
	SELECT 1 FROM `sync_local_meta`
	WHERE `protocol` <> 'library-sidecar-automerge'
);
--> statement-breakpoint
DELETE FROM `sync_automerge_state`
WHERE EXISTS (
	SELECT 1 FROM `sync_local_meta`
	WHERE `protocol` <> 'library-sidecar-automerge'
);
--> statement-breakpoint
DELETE FROM `sync_errors`
WHERE EXISTS (
	SELECT 1 FROM `sync_local_meta`
	WHERE `protocol` <> 'library-sidecar-automerge'
);
--> statement-breakpoint
DELETE FROM `sync_local_meta`
WHERE `protocol` <> 'library-sidecar-automerge';
