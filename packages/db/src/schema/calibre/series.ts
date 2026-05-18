import { sqliteTable, integer, text, uniqueIndex, index } from "drizzle-orm/sqlite-core";

export const series = sqliteTable("series", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  sort: text("sort"),
  link: text("link").default(""),
});

export const booksSeriesLink = sqliteTable(
  "books_series_link",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    book: integer("book").notNull(),
    series: integer("series").notNull(),
  },
  (table) => [
    uniqueIndex("books_series_link_book_series").on(table.book, table.series),
    index("books_series_link_book").on(table.book),
    index("books_series_link_series").on(table.series),
  ],
);
