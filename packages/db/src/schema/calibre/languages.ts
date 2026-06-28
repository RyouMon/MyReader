import {
  sqliteTable,
  integer,
  text,
  uniqueIndex,
  index,
} from "drizzle-orm/sqlite-core"

export const languages = sqliteTable("languages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  langCode: text("lang_code").notNull(),
  link: text("link").default(""),
})

export const booksLanguagesLink = sqliteTable(
  "books_languages_link",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    book: integer("book").notNull(),
    langCode: integer("lang_code").notNull(),
    itemOrder: integer("item_order").default(1),
  },
  (table) => [
    uniqueIndex("books_languages_link_book_lang_code").on(
      table.book,
      table.langCode,
    ),
    index("books_languages_link_book").on(table.book),
    index("books_languages_link_lang_code").on(table.langCode),
  ],
)
