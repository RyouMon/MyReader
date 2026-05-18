import { sqliteTable, integer, text, uniqueIndex, index } from "drizzle-orm/sqlite-core";

export const ratings = sqliteTable("ratings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  rating: integer("rating").notNull(),
  link: text("link").default(""),
});

export const booksRatingsLink = sqliteTable(
  "books_ratings_link",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    book: integer("book").notNull(),
    rating: integer("rating").notNull(),
  },
  (table) => [
    uniqueIndex("books_ratings_link_book_rating").on(table.book, table.rating),
    index("books_ratings_link_book").on(table.book),
    index("books_ratings_link_rating").on(table.rating),
  ],
);
