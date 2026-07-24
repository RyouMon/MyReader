import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core"

/** Remote Automerge objects that were validated and committed locally. */
export const syncAutomergeReceipts = sqliteTable(
  "sync_automerge_receipts",
  {
    /** 32-character UUID. */
    id: text("id").notNull().primaryKey(),
    /** Object path relative to the library root. */
    objectPath: text("object_path").notNull(),
    /** Full SHA-256 of the accepted immutable object bytes. */
    sha256: text("sha256").notNull(),
    /** Unix epoch milliseconds when state and projections committed successfully. */
    appliedAt: integer("applied_at").notNull(),
  },
  (t) => [
    uniqueIndex("idx_sync_automerge_receipts_path").on(t.objectPath),
    index("idx_sync_automerge_receipts_applied_at").on(t.appliedAt),
  ],
)
