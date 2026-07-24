import {
  blob,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core"

/** Validated Automerge changes retained independently of compact snapshots. */
export const syncAutomergeChanges = sqliteTable(
  "sync_automerge_changes",
  {
    /** 32-character UUID. */
    id: text("id").notNull().primaryKey(),
    /** Automerge ChangeHash used for content identity and deduplication. */
    changeHash: text("change_hash").notNull(),
    /** Lowercase Automerge actor ID that authored the change. */
    actorId: text("actor_id").notNull(),
    /** Actor-local Automerge change sequence stored as decimal text to preserve u64. */
    actorSequence: text("actor_sequence").notNull(),
    /** Official Automerge binary encoding of exactly one change. */
    bytes: blob("bytes", { mode: "buffer" }).notNull(),
    /** Whether this device created the change locally or accepted it from remote storage. */
    origin: text("origin", { enum: ["local", "remote"] }).notNull(),
    /** Unix epoch milliseconds when this device durably accepted the change. */
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("idx_sync_automerge_changes_hash").on(t.changeHash),
    uniqueIndex("idx_sync_automerge_changes_actor_sequence").on(
      t.actorId,
      t.actorSequence,
    ),
    index("idx_sync_automerge_changes_created_at").on(t.createdAt),
  ],
)
