CREATE TABLE `sync_schedule_state` (
	`id` text PRIMARY KEY NOT NULL,
	`last_successful_pull_at` integer,
	`next_retry_at` integer,
	`transient_failure_count` integer DEFAULT 0 NOT NULL,
	`suspended_reason` text
);
