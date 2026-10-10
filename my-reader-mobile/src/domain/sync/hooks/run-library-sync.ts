import { syncFailureKeys } from "@my-reader/i18n/mobile"
import { showAlertWithStatusBarRestore } from "@/src/constants/alert-with-status-bar"
import {
  DEFAULT_SYNC_POLICY,
  type LibrarySyncReport,
  resolveSyncOptions,
  type SyncLibraryOptions,
  type SyncTrigger,
  syncLibrary,
} from "@/src/domain/sync"
import { SyncConnectivityError } from "@/src/errors"
import i18n from "@/src/i18n"
import { useAppStore } from "@/src/store/app-store"
import { observeLibrarySync } from "@/src/store/sync-status-observer"

import { applySyncReport } from "./apply-sync-report"
import { syncReasonForTrigger } from "../sync-reason"
import { classifySyncFailure } from "../failure"

export type RunLibrarySyncInput = {
  libraryId: string
  trigger: SyncTrigger
  options?: Partial<SyncLibraryOptions>
  showFailureAlert?: boolean
}

function showSyncFailureAlert(title: string, message: string): void {
  showAlertWithStatusBarRestore(title, message, [
    { text: i18n.t("common.gotIt") },
  ])
}

/** Orchestrates domain sync + UI write-back after adding a library or syncing manually. */
export async function runLibrarySync(
  input: RunLibrarySyncInput,
): Promise<LibrarySyncReport> {
  const state = useAppStore.getState()
  if (state.activeLibraryId !== input.libraryId) {
    throw new Error(i18n.t("syncStatus.activeLibraryChanged"))
  }
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
  const options: SyncLibraryOptions = {
    ...(resolved ?? {
      scope: "all",
      throwOnFailure: input.trigger === "manual" || input.trigger === "add",
    }),
    reason: syncReasonForTrigger(input.trigger),
  }
  const showFailureAlert =
    options.throwOnFailure && input.showFailureAlert !== false

  try {
    const report = await syncLibrary(
      library,
      state.dataSources,
      options,
      observeLibrarySync,
    )
    await applySyncReport(report, { trigger: input.trigger })
    return report
  } catch (err) {
    if (err instanceof SyncConnectivityError) {
      await applySyncReport(err.report, { trigger: input.trigger })
    }
    if (showFailureAlert) {
      const keys = syncFailureKeys(classifySyncFailure(err))
      showSyncFailureAlert(i18n.t(keys.title), i18n.t(keys.detail))
    }
    throw err
  }
}
