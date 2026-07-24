import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core"

/** Causal boundary represented by the current SQLite domain projections. */
export const syncAutomergeProjectionMeta = sqliteTable(
  "sync_automerge_projection_meta",
  {
    /** Non-business singleton key; always local. */
    id: text("id").notNull().primaryKey(),
    /** MyReader projection schema version. */
    projectionVersion: integer("projection_version").notNull(),
    /** Sorted JSON array of Automerge heads included in the projections. */
    headsJson: text("heads_json").notNull(),
    /** Unix epoch milliseconds of the last deterministic full rebuild; null before any rebuild. */
    rebuiltAt: integer("rebuilt_at"),
  },
)
