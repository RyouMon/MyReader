import { sqliteTable, text } from "drizzle-orm/sqlite-core"

/** Persisted Hybrid Logical Clock state for the current library and replica. */
export const syncHlcState = sqliteTable("sync_hlc_state", {
  /** 32-character UUID. */
  id: text("id").notNull().primaryKey(),
  /** Greatest observed HLC physical time in milliseconds, stored as decimal text to preserve u64. */
  physicalMs: text("physical_ms").notNull(),
  /** Logical counter within the same physical millisecond, stored as decimal text to preserve u64. */
  counter: text("counter").notNull(),
})
