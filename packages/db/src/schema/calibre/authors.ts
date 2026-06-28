import {
  sqliteTable,
  integer,
  text,
  uniqueIndex,
  index,
} from "drizzle-orm/sqlite-core"

export const authors = sqliteTable("authors", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  sort: text("sort"),
  link: text("link").default(""),
})

export const booksAuthorsLink = sqliteTable(
  "books_authors_link",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    book: integer("book").notNull(),
    author: integer("author").notNull(),
  },
  (table) => [
    uniqueIndex("books_authors_link_book_author").on(table.book, table.author),
    index("books_authors_link_book").on(table.book),
    index("books_authors_link_author").on(table.author),
  ],
)
