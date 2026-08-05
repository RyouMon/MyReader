CREATE TABLE `library_id` (
	`id` integer PRIMARY KEY NOT NULL,
	`uuid` text NOT NULL UNIQUE
);
--> statement-breakpoint
CREATE TABLE `books` (
	`id` integer PRIMARY KEY NOT NULL,
	`title` text,
	`sort` text,
	`timestamp` text,
	`pubdate` text,
	`series_index` real,
	`author_sort` text,
	`isbn` text,
	`lccn` text,
	`path` text,
	`flags` integer,
	`uuid` text,
	`has_cover` integer,
	`last_modified` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_books_uuid` ON `books` (`uuid`);
--> statement-breakpoint
CREATE TABLE `authors` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`sort` text,
	`link` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_authors_name` ON `authors` (`name`);
--> statement-breakpoint
CREATE TABLE `books_authors_link` (
	`id` integer PRIMARY KEY NOT NULL,
	`book` integer NOT NULL,
	`author` integer NOT NULL,
	UNIQUE (`book`, `author`)
);
--> statement-breakpoint
CREATE TABLE `data` (
	`id` integer PRIMARY KEY NOT NULL,
	`book` integer NOT NULL,
	`format` text NOT NULL,
	`uncompressed_size` integer NOT NULL,
	`name` text NOT NULL,
	UNIQUE (`book`, `format`)
);
--> statement-breakpoint
CREATE TABLE `tags` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`link` text
);
--> statement-breakpoint
CREATE TABLE `books_tags_link` (
	`id` integer PRIMARY KEY NOT NULL,
	`book` integer NOT NULL,
	`tag` integer NOT NULL,
	UNIQUE (`book`, `tag`)
);
--> statement-breakpoint
CREATE TABLE `series` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`sort` text,
	`link` text
);
--> statement-breakpoint
CREATE TABLE `books_series_link` (
	`id` integer PRIMARY KEY NOT NULL,
	`book` integer NOT NULL,
	`series` integer NOT NULL,
	UNIQUE (`book`, `series`)
);
--> statement-breakpoint
CREATE TABLE `comments` (
	`id` integer PRIMARY KEY NOT NULL,
	`book` integer NOT NULL,
	`text` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `publishers` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`sort` text,
	`link` text
);
--> statement-breakpoint
CREATE TABLE `books_publishers_link` (
	`id` integer PRIMARY KEY NOT NULL,
	`book` integer NOT NULL,
	`publisher` integer NOT NULL,
	UNIQUE (`book`, `publisher`)
);
--> statement-breakpoint
CREATE TABLE `languages` (
	`id` integer PRIMARY KEY NOT NULL,
	`lang_code` text NOT NULL,
	`link` text
);
--> statement-breakpoint
CREATE TABLE `books_languages_link` (
	`id` integer PRIMARY KEY NOT NULL,
	`book` integer NOT NULL,
	`lang_code` integer NOT NULL,
	`item_order` integer,
	UNIQUE (`book`, `lang_code`)
);
--> statement-breakpoint
CREATE TABLE `ratings` (
	`id` integer PRIMARY KEY NOT NULL,
	`rating` integer NOT NULL,
	`link` text
);
--> statement-breakpoint
CREATE TABLE `books_ratings_link` (
	`id` integer PRIMARY KEY NOT NULL,
	`book` integer NOT NULL,
	`rating` integer NOT NULL,
	UNIQUE (`book`, `rating`)
);
--> statement-breakpoint
CREATE TABLE `identifiers` (
	`id` integer PRIMARY KEY NOT NULL,
	`book` integer NOT NULL,
	`type` text,
	`val` text NOT NULL
);
