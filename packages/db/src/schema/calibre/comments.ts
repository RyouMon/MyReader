import { sqliteTable, integer, text, index } from "drizzle-orm/sqlite-core";

export const comments = sqliteTable(
  "comments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    book: integer("book").notNull(),
    text: text("text").notNull(),
  },
  (table) => [
    index("comments_book").on(table.book),
  ],
);
