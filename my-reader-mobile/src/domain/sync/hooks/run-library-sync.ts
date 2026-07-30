import { showAlertWithStatusBarRestore } from "@/src/constants/alert-with-status-bar"
import {
  DEFAULT_SYNC_POLICY,
  resolveSyncOptions,
  syncLibrary,
  type LibrarySyncReport,
  type SyncLibraryOptions,
  type SyncTrigger,
} from "@/src/domain/sync"
import { SyncConnectivityError } from "@/src/errors"
import i18n from "@/src/i18n"
import { useAppStore } from "@/src/store/app-store"

import { applySyncReport } from "./apply-sync-report"

export type RunLibrarySyncInput = {
  libraryId: string
  trigger: SyncTrigger
  options?: Partial<SyncLibraryOptions>
}

function showSyncFailureAlert(message: string): void {
  showAlertWithStatusBarRestore(i18n.t("sync.sourceUnreachable"), message, [
    { text: i18n.t("common.gotIt") },
  ])
}

/** Orchestrates domain sync + UI write-back; used by registerLibrary and manual sync. */
export async function runLibrarySync(
  input: RunLibrarySyncInput,
): Promise<LibrarySyncReport> {
  const state = useAppStore.getState()
  const library = state.libraries.find((item) => item.id === input.libraryId)
  if (!library) {
    throw new Error(i18n.t("sync.refreshLibraryFailed"))
  }

  const resolved = resolveSyncOptions(
    input.trigger,
    DEFAULT_SYNC_POLICY,
    undefined,
    input.options,
  )
  const options: SyncLibraryOptions = resolved ?? {
    scope: "all",
    throwOnFailure: input.trigger === "manual" || input.trigger === "add",
  }

  try {
    const report = await syncLibrary(library, state.dataSources, options)
    await applySyncReport(report, { trigger: input.trigger })
    return report
  } catch (err) {
    if (err instanceof SyncConnectivityError) {
      await applySyncReport(err.report, { trigger: input.trigger })
      if (options.throwOnFailure) {
        showSyncFailureAlert(err.message)
      }
    } else if (options.throwOnFailure) {
      const message = err instanceof Error ? err.message : String(err)
      showSyncFailureAlert(message)
    }
    throw err
  }
}
