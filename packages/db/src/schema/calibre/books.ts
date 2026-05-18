import { sqliteTable, integer, text, real } from "drizzle-orm/sqlite-core";

export const books = sqliteTable("books", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").default("Unknown"),
  sort: text("sort"),
  timestamp: text("timestamp").default("CURRENT_TIMESTAMP"),
  pubdate: text("pubdate").default("CURRENT_TIMESTAMP"),
  seriesIndex: real("series_index").default(1.0),
  authorSort: text("author_sort"),
  isbn: text("isbn").default(""),
  lccn: text("lccn").default(""),
  path: text("path").default(""),
  flags: integer("flags").default(1),
  uuid: text("uuid"),
  hasCover: integer("has_cover").default(0),
  lastModified: text("last_modified").default("2000-01-01 00:00:00+00:00"),
});
