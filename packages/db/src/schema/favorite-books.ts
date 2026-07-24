import {
  sqliteTable,
  integer,
  text,
  real,
  uniqueIndex,
} from "drizzle-orm/sqlite-core"

export const favoriteBooks = sqliteTable(
  "favorite_books",
  {
    id: text("id").notNull().primaryKey(),
    bookId: integer("book_id").notNull(),
    addedAt: real("added_at").notNull().default(0),
    /** Whether the projected book_favorite.v1 register is currently active. */
    isFavorite: integer("is_favorite", { mode: "boolean" })
      .notNull()
      .default(true),
  },
  (t) => [uniqueIndex("idx_favorite_books_book_id").on(t.bookId)],
)
