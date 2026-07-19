import {
  index,
  integer,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core"

export const annotations = sqliteTable(
  "annotations",
  {
    id: text("id").notNull().primaryKey(),
    bookId: integer("book_id").notNull(),
    format: text("format").notNull(),
    kind: text("kind").notNull(),
    locatorJson: text("locator_json").notNull(),
    color: text("color").notNull(),
    note: text("note"),
    createdAt: real("created_at").notNull(),
    updatedAt: real("updated_at").notNull(),
    deletedAt: real("deleted_at"),
  },
  (t) => [
    index("idx_annotations_book_format").on(t.bookId, t.format),
    index("idx_annotations_updated_at").on(t.updatedAt),
  ],
)
