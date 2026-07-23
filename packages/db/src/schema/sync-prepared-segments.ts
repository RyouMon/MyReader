import {
  blob,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core"

/** Local segments with fixed paths and raw bytes that can be uploaded repeatedly without changing content. */
export const syncPreparedSegments = sqliteTable(
  "sync_prepared_segments",
  {
    /** 32-character UUID. */
    id: text("id").notNull().primaryKey(),
    /** Monotonically increasing sequence within the current replica, stored as decimal text to preserve u64. */
    sequence: text("sequence").notNull(),
    /** Final sidecar object path relative to the library root. */
    path: text("path").notNull(),
    /** Raw JSON bytes created during the first prepare operation and reused byte-for-byte on retries. */
    bytes: blob("bytes", { mode: "buffer" }).notNull(),
    /** Full SHA-256 of the raw JSON bytes; the filename uses its first 128 bits. */
    sha256: text("sha256").notNull(),
    /** JSON array of change IDs in this segment, used to clean the outbox after publication. */
    changeIdsJson: text("change_ids_json").notNull(),
    /** Unix epoch milliseconds of successful upload; null while publication is pending. */
    publishedAt: integer("published_at"),
  },
  (t) => [
    uniqueIndex("idx_sync_prepared_segments_sequence").on(t.sequence),
    uniqueIndex("idx_sync_prepared_segments_path").on(t.path),
    index("idx_sync_prepared_segments_published_at").on(t.publishedAt),
  ],
)
