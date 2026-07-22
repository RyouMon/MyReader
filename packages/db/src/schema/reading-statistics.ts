import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core"

export const readingSessions = sqliteTable(
  "reading_sessions",
  {
    id: text("id").notNull().primaryKey(),
    bookId: integer("book_id").notNull(),
    format: text("format").notNull(),
    localDay: text("local_day").notNull(),
    startedAt: real("started_at").notNull(),
    durationSeconds: integer("duration_seconds").notNull().default(0),
    updatedAt: real("updated_at").notNull(),
  },
  (t) => [
    index("idx_reading_sessions_local_day").on(t.localDay),
    index("idx_reading_sessions_book_id").on(t.bookId),
  ],
)

export const readingCompletions = sqliteTable(
  "reading_completions",
  {
    id: text("id").notNull().primaryKey(),
    bookId: integer("book_id").notNull(),
    format: text("format").notNull(),
    localDay: text("local_day").notNull(),
    completedAt: real("completed_at").notNull(),
    updatedAt: real("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("idx_reading_completions_book_id").on(t.bookId),
    index("idx_reading_completions_local_day").on(t.localDay),
  ],
)
