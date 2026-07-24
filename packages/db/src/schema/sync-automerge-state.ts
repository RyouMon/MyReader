import { blob, integer, sqliteTable, text } from "drizzle-orm/sqlite-core"

/** Durable Automerge document state for the current library. */
export const syncAutomergeState = sqliteTable("sync_automerge_state", {
  /** Non-business singleton key; always local. */
  id: text("id").notNull().primaryKey(),
  /** MyReader document schema version hydrated by snapshot_bytes. */
  schemaVersion: integer("schema_version").notNull(),
  /** Compact Automerge snapshot containing the complete accepted causal history. */
  snapshotBytes: blob("snapshot_bytes", { mode: "buffer" }).notNull(),
  /** Sorted JSON array of Automerge heads represented by snapshot_bytes. */
  headsJson: text("heads_json").notNull(),
  /** Unix epoch milliseconds when this durable state was committed. */
  updatedAt: integer("updated_at").notNull(),
})
