import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core"

export const libraryId = sqliteTable("library_id", {
  id: integer("id").primaryKey(),
  uuid: text("uuid").notNull().unique(),
})
