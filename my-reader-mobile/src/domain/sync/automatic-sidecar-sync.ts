import type { DataSource, Library } from "../types"
import {
  DataIntegrityError,
  NetworkError,
  SyncConfigError,
  SyncConnectivityError,
} from "../../errors"
import { applySyncReport } from "./hooks/apply-sync-report"
import { hasPendingLibrarySidecarAutomergeChanges } from "./library-sidecar/automerge-store"
import {
  createSidecarSyncScheduler,
  type SidecarSyncErrorDisposition,
  type SidecarSyncScheduler,
} from "./sidecar-scheduler"
import { syncLibrary } from "./sync-library"

export type AutomaticSidecarSyncState = {
  libraries: Library[]
  dataSources: DataSource[]
  enableAutoSync: boolean
}

export function classifyAutomaticSidecarSyncError(
  error: unknown,
): SidecarSyncErrorDisposition {
  if (error instanceof SyncConfigError || error instanceof DataIntegrityError) {
    return "suspend"
  }
  if (error instanceof SyncConnectivityError || error instanceof NetworkError) {
    return "retry"
  }
  const message = error instanceof Error ? error.message : String(error)
  if (
    /network|offline|timeout|timed out|connection|temporar|unavailable|rate.?limit|429|5\d\d/i.test(
      message,
    )
  ) {
    return "retry"
  }
  return "suspend"
}

export function createAutomaticSidecarSyncScheduler(
  getState: () => AutomaticSidecarSyncState,
  onError?: (error: unknown) => void,
): SidecarSyncScheduler {
  return createSidecarSyncScheduler({
    async execute(execution) {
      const state = getState()
      if (!state.enableAutoSync) return
      const library = state.libraries.find(
        (candidate) => candidate.id === execution.libraryId,
      )
      if (!library) return
      const report = await syncLibrary(library, state.dataSources, {
        scope: "myreader",
        myreaderMode: execution.mode,
        throwOnFailure: true,
      })
      applySyncReport(report, { trigger: "scheduled" })
    },
    classifyError: classifyAutomaticSidecarSyncError,
    onError(error, execution) {
      console.warn("[reading-sync] automatic:failed", {
        libraryId: execution.libraryId,
        mode: execution.mode,
        reasons: execution.reasons,
        error: error instanceof Error ? error.message : String(error),
      })
      onError?.(error)
    },
  })
}

export async function recoverPendingSidecarWork(
  scheduler: SidecarSyncScheduler,
  libraries: Library[],
): Promise<void> {
  for (const library of libraries) {
    if (await hasPendingLibrarySidecarAutomergeChanges(library)) {
      scheduler.request({
        libraryId: library.id,
        mode: "push_only",
        reason: "local_change",
        timing: "immediate",
      })
    }
  }
}
