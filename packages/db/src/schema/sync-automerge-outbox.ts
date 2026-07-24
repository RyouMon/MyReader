import {
  blob,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core"

/** Immutable Automerge incremental objects waiting to be published to the library sidecar. */
export const syncAutomergeOutbox = sqliteTable(
  "sync_automerge_outbox",
  {
    /** 32-character UUID. */
    id: text("id").notNull().primaryKey(),
    /** Final object path relative to the library root. */
    objectPath: text("object_path").notNull(),
    /** Official Automerge incremental bytes reused byte-for-byte on every retry. */
    bytes: blob("bytes", { mode: "buffer" }).notNull(),
    /** Full SHA-256 of bytes used to detect an immutable-path collision. */
    sha256: text("sha256").notNull(),
    /** JSON array of ChangeHash values contained in bytes. */
    changeHashesJson: text("change_hashes_json").notNull(),
    /** Unix epoch milliseconds of successful publication; null while pending. */
    publishedAt: integer("published_at"),
  },
  (t) => [
    uniqueIndex("idx_sync_automerge_outbox_path").on(t.objectPath),
    index("idx_sync_automerge_outbox_published_at").on(t.publishedAt),
  ],
)
