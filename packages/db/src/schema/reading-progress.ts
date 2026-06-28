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
    updatedAt: real("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("idx_reading_progress_book_format").on(t.bookId, t.format),
  ],
)
