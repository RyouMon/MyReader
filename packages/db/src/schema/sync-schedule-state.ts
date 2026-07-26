import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core"

/** Local automatic sidecar synchronization scheduling state. */
export const syncScheduleState = sqliteTable("sync_schedule_state", {
  /** Singleton row key; always `local`. */
  id: text("id").notNull().primaryKey(),
  /** Last time a full sidecar pull completed successfully, in Unix milliseconds. */
  lastSuccessfulPullAt: integer("last_successful_pull_at"),
  /** Earliest time a transient automatic retry may run, in Unix milliseconds. */
  nextRetryAt: integer("next_retry_at"),
  /** Consecutive transient automatic synchronization failures. */
  transientFailureCount: integer("transient_failure_count")
    .notNull()
    .default(0),
  /** Stable error category that suspended automatic retries until a later wake-up. */
  suspendedReason: text("suspended_reason"),
})
