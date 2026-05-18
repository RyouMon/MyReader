import { sqliteTable, integer, text, index } from "drizzle-orm/sqlite-core";

export const identifiers = sqliteTable(
  "identifiers",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    book: integer("book").notNull(),
    type: text("type").default("isbn"),
    val: text("val").notNull(),
  },
  (table) => [
    index("identifiers_book").on(table.book),
    index("identifiers_book_type").on(table.book, table.type),
  ],
);
