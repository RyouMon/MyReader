import { sqliteTable, integer, text, index } from "drizzle-orm/sqlite-core";

export const data = sqliteTable(
  "data",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    book: integer("book").notNull(),
    format: text("format").notNull(),
    uncompressedSize: integer("uncompressed_size").notNull(),
    name: text("name").notNull(),
  },
  (table) => [
    index("data_book").on(table.book),
  ],
);
