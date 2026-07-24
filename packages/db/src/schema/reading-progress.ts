import {
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core"

export const readingProgress = sqliteTable(
  "reading_progress",
  {
    id: text("id").notNull().primaryKey(),
    bookId: integer("book_id").notNull(),
    format: text("format").notNull(),
    locatorJson: text("locator_json").notNull(),
    displayProgression: real("display_progression"),
    updatedAt: real("updated_at").notNull(),
    /** HLC of the projected reading_position.v1 register; null for pre-v4 local rows. */
    syncClock: text("sync_clock"),
  },
  (t) => [
    uniqueIndex("idx_reading_progress_book_format").on(t.bookId, t.format),
  ],
)
