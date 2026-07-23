import { sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"

/** The contiguous boundary applied to local domain tables for each remote replica. */
export const syncCursors = sqliteTable(
  "sync_cursors",
  {
    /** 32-character UUID. */
    id: text("id").notNull().primaryKey(),
    /** UUIDv4 of the remote replica; each replica has exactly one cursor row. */
    replicaId: text("replica_id").notNull(),
    /** Last contiguously applied segment sequence, stored as decimal text to preserve u64. */
    sequence: text("sequence").notNull(),
    /** Full SHA-256 of the raw JSON bytes at that sequence, retained as the boundary fingerprint. */
    fileHash: text("file_hash").notNull(),
  },
  (t) => [uniqueIndex("idx_sync_cursors_replica_id").on(t.replicaId)],
)
