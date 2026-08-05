ALTER TABLE `file_state` RENAME COLUMN `local_blake3` TO `local_sha256`;
--> statement-breakpoint
UPDATE `file_state` SET `local_sha256` = NULL;
