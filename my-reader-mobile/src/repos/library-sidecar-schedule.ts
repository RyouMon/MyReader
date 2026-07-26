import type { Scalar } from "@op-engineering/op-sqlite"
import type { Library } from "@my-reader/tools/types/library"

import { withLibrarySidecarSyncTransaction } from "./library-sidecar-sync"

export type LibrarySidecarScheduleState = {
  lastSuccessfulPullAt: number | null
  nextRetryAt: number | null
  transientFailureCount: number
  suspendedReason: string | null
}

type DbRow = Record<string, Scalar>

function optionalInteger(row: DbRow, key: string): number | null {
  const value = row[key]
  if (value === null) return null
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error(`Expected ${key} to be an integer`)
  }
  return value
}

export async function readLibrarySidecarScheduleState(
  library: Library,
): Promise<LibrarySidecarScheduleState | null> {
  return withLibrarySidecarSyncTransaction(library, async (tx) => {
    const result = await tx.execute(
      `SELECT last_successful_pull_at, next_retry_at,
          transient_failure_count, suspended_reason
        FROM sync_schedule_state
        WHERE id = 'local'`,
    )
    const row = result.rows[0]
    if (!row) return null
    const failureCount = row.transient_failure_count
    const suspendedReason = row.suspended_reason
    if (
      typeof failureCount !== "number" ||
      !Number.isSafeInteger(failureCount)
    ) {
      throw new Error("Expected transient_failure_count to be an integer")
    }
    if (suspendedReason !== null && typeof suspendedReason !== "string") {
      throw new Error("Expected suspended_reason to be text")
    }
    return {
      lastSuccessfulPullAt: optionalInteger(row, "last_successful_pull_at"),
      nextRetryAt: optionalInteger(row, "next_retry_at"),
      transientFailureCount: failureCount,
      suspendedReason,
    }
  })
}

export async function writeLibrarySidecarScheduleState(
  library: Library,
  state: LibrarySidecarScheduleState,
): Promise<void> {
  await withLibrarySidecarSyncTransaction(library, async (tx) => {
    await tx.execute(
      `INSERT INTO sync_schedule_state
        (id, last_successful_pull_at, next_retry_at,
          transient_failure_count, suspended_reason)
        VALUES ('local', ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          last_successful_pull_at = excluded.last_successful_pull_at,
          next_retry_at = excluded.next_retry_at,
          transient_failure_count = excluded.transient_failure_count,
          suspended_reason = excluded.suspended_reason`,
      [
        state.lastSuccessfulPullAt,
        state.nextRetryAt,
        state.transientFailureCount,
        state.suspendedReason,
      ],
    )
  })
}

export async function markLibrarySidecarSyncSucceeded(
  library: Library,
  completedPullAt: number | null,
): Promise<void> {
  await withLibrarySidecarSyncTransaction(library, async (tx) => {
    await tx.execute(
      `INSERT INTO sync_schedule_state
        (id, last_successful_pull_at, next_retry_at,
          transient_failure_count, suspended_reason)
        VALUES ('local', ?, NULL, 0, NULL)
        ON CONFLICT(id) DO UPDATE SET
          last_successful_pull_at = COALESCE(
            excluded.last_successful_pull_at,
            sync_schedule_state.last_successful_pull_at
          ),
          next_retry_at = NULL,
          transient_failure_count = 0,
          suspended_reason = NULL`,
      [completedPullAt],
    )
  })
}
