import {
  sqliteTable,
  integer,
  text,
  uniqueIndex,
  index,
} from "drizzle-orm/sqlite-core"

export const publishers = sqliteTable("publishers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  sort: text("sort"),
  link: text("link").default(""),
})

export const booksPublishersLink = sqliteTable(
  "books_publishers_link",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    book: integer("book").notNull(),
    publisher: integer("publisher").notNull(),
  },
  (table) => [
    uniqueIndex("books_publishers_link_book_publisher").on(
      table.book,
      table.publisher,
    ),
    index("books_publishers_link_book").on(table.book),
    index("books_publishers_link_publisher").on(table.publisher),
  ],
)
