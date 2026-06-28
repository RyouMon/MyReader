import {
  sqliteTable,
  integer,
  text,
  uniqueIndex,
  index,
} from "drizzle-orm/sqlite-core"

export const tags = sqliteTable("tags", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  link: text("link").default(""),
})

export const booksTagsLink = sqliteTable(
  "books_tags_link",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    book: integer("book").notNull(),
    tag: integer("tag").notNull(),
  },
  (table) => [
    uniqueIndex("books_tags_link_book_tag").on(table.book, table.tag),
    index("books_tags_link_book").on(table.book),
    index("books_tags_link_tag").on(table.tag),
  ],
)
