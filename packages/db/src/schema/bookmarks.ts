import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core"

export const bookmarks = sqliteTable(
  "bookmarks",
  {
    id: text("id").notNull().primaryKey(),
    bookId: integer("book_id").notNull(),
    format: text("format").notNull(),
    locatorKey: text("locator_key").notNull(),
    locatorJson: text("locator_json").notNull(),
    createdAt: real("created_at").notNull(),
    updatedAt: real("updated_at").notNull(),
    deletedAt: real("deleted_at"),
    /** HLC of the projected bookmark.v1 register; null for pre-v4 local rows. */
    syncClock: text("sync_clock"),
  },
  (t) => [
    uniqueIndex("idx_bookmarks_book_format_locator").on(
      t.bookId,
      t.format,
      t.locatorKey,
    ),
    index("idx_bookmarks_updated_at").on(t.updatedAt),
  ],
)
