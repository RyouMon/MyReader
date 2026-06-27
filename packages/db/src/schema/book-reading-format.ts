import { sqliteTable, integer, text, real, uniqueIndex } from "drizzle-orm/sqlite-core";

export const bookReadingFormat = sqliteTable(
  "book_reading_format",
  {
    id: text("id").notNull().primaryKey(),
    bookId: integer("book_id").notNull(),
    readingFormat: text("reading_format").notNull(),
    updatedAt: real("updated_at").notNull().default(0),
  },
  (t) => [uniqueIndex("idx_book_reading_format_book_id").on(t.bookId)],
);
