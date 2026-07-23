import { index, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"

/** Local changes written in the same transaction as domain mutations and waiting to enter a segment. */
export const syncOutbox = sqliteTable(
  "sync_outbox",
  {
    /** 32-character UUID. */
    id: text("id").notNull().primaryKey(),
    /** Globally unique change ID as a compact UUIDv4. */
    changeId: text("change_id").notNull(),
    /** Full HLC that orders LWW values and identifies the writer replica. */
    clock: text("clock").notNull(),
    /** Versioned domain of the CRDT state, such as reading_position.v1. */
    domain: text("domain").notNull(),
    /** Complete CRDT state JSON rather than an incremental patch to a domain row. */
    stateJson: text("state_json").notNull(),
    /** Assigned local segment sequence; null until the change enters a prepared segment. */
    segmentSequence: text("segment_sequence"),
  },
  (t) => [
    uniqueIndex("idx_sync_outbox_change_id").on(t.changeId),
    index("idx_sync_outbox_clock").on(t.clock),
    index("idx_sync_outbox_segment_sequence").on(t.segmentSequence),
  ],
)
