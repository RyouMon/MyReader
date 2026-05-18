import { sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const syncMeta = sqliteTable(
  "sync_meta",
  {
    id: text("id").notNull().primaryKey(),
    key: text("key").notNull(),
    value: text("value").notNull(),
  },
  (t) => [uniqueIndex("idx_sync_meta_key").on(t.key)],
);