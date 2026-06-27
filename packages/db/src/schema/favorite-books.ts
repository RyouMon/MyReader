import { sqliteTable, integer, text, real, uniqueIndex } from "drizzle-orm/sqlite-core";

export const favoriteBooks = sqliteTable(
  "favorite_books",
  {
    id: text("id").notNull().primaryKey(),
    bookId: integer("book_id").notNull(),
    addedAt: real("added_at").notNull().default(0),
  },
  (t) => [uniqueIndex("idx_favorite_books_book_id").on(t.bookId)],
);
