import type { Library } from "@my-reader/tools/types/library"

import MyReaderRustComponents from "@/modules/myreader-rust-components"
import { getLibraryDatabase } from "@/src/services/db/library-db"

export type LibrarySidecarScheduleState = {
  lastSuccessfulPullAt: number | null
  nextRetryAt: number | null
  transientFailureCount: number
  suspendedReason: string | null
}

async function databasePath(library: Library): Promise<string> {
  return (await getLibraryDatabase(library)).path
}

export async function readLibrarySidecarScheduleState(
  library: Library,
): Promise<LibrarySidecarScheduleState | null> {
  return MyReaderRustComponents.readSyncDatabaseScheduleState(
    await databasePath(library),
  )
}

export async function writeLibrarySidecarScheduleState(
  library: Library,
  state: LibrarySidecarScheduleState,
): Promise<void> {
  await MyReaderRustComponents.writeSyncDatabaseScheduleState(
    await databasePath(library),
    state.lastSuccessfulPullAt,
    state.nextRetryAt,
    state.transientFailureCount,
    state.suspendedReason,
  )
}

export async function markLibrarySidecarSyncSucceeded(
  library: Library,
  completedPullAt: number | null,
): Promise<void> {
  await MyReaderRustComponents.markSyncDatabaseScheduleSucceeded(
    await databasePath(library),
    completedPullAt,
  )
}
