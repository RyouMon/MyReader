import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core"

/** Sync protocol errors that cannot be applied automatically. */
export const syncErrors = sqliteTable(
  "sync_errors",
  {
    /** 32-character UUID. */
    id: text("id").notNull().primaryKey(),
    /** Stable protocol error code, such as missing_dependency or replica_fork. */
    code: text("code").notNull(),
    /** UUIDv4 of the remote replica that caused the error; null when unknown. */
    replicaId: text("replica_id"),
    /** Automerge actor sequence associated with the error; null when unknown. */
    sequence: text("sequence"),
    /** Sync domain when a specific state is identified. */
    domain: text("domain"),
    /** Full SHA-256 of the failing remote bytes; null before a file is read. */
    fileHash: text("file_hash"),
    /** Unix epoch milliseconds when this device detected and recorded the error. */
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("idx_sync_errors_created_at").on(t.createdAt)],
)
