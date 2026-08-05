import { DataIntegrityError, SyncConnectivityError } from "../../errors"
import {
  invalidateFavoriteBooks,
  invalidateReaderAnnotations,
  invalidateReaderBookmarks,
  invalidateReadingProgress,
  invalidateReadingStatistics,
  invalidateRecentlyReadBooks,
} from "../../services/query/invalidate-table"
import { describeError } from "../../utils/common"
import { withLocalLibraryContentRoot } from "../../services/fs/local-library-content"
import { fetchBooks } from "../library/catalog"
import {
  isAndroidSafLibrary,
  managedBookRelativePaths,
  pullAndroidSafControl,
  pushAndroidSafControl,
  reconcileAndroidSafBooks,
} from "../library/android-saf-library"
import type { DataSource, Library } from "../types"
import { openSyncContext } from "./context"
import { runCoreLibrarySync } from "./core-sync"
import { DEFAULT_SYNC_POLICY, resolveSyncOptions } from "./policy"
import type {
  CalibreSyncResult,
  LibrarySyncReport,
  MyReaderSyncResult,
  ScheduledSyncTarget,
  SyncLibrariesDeps,
  SyncLibraryOptions,
  SyncRunReport,
  SyncTrigger,
  SyncTriggerPolicy,
} from "./types"

function mergeOptions(
  trigger: SyncTrigger,
  policy: SyncTriggerPolicy,
  scheduledTarget: ScheduledSyncTarget | undefined,
  overrides?: Partial<SyncLibraryOptions>,
): SyncLibraryOptions {
  const resolved = resolveSyncOptions(
    trigger,
    policy,
    scheduledTarget,
    overrides,
  )
  if (!resolved) {
    return { scope: "all", throwOnFailure: false }
  }
  return resolved
}

function failedReport(
  library: Library,
  options: SyncLibraryOptions,
  errorMessage: string,
  startedAt: number,
  failureKind?: LibrarySyncReport["failureKind"],
): LibrarySyncReport {
  const mode = options.myreaderMode ?? "full"
  return {
    libraryId: library.id,
    libraryName: library.name,
    durationMs: Date.now() - startedAt,
    error: errorMessage,
    calibre: {
      skipped: true,
      skipReason: "error",
      changed: false,
      library,
      error: errorMessage,
    },
    myreader: {
      skipped: true,
      skipReason: "error",
      mode,
      providers: {},
      error: errorMessage,
    },
    failureKind,
  }
}

function calibreSkipReason(
  reason: string | undefined,
): CalibreSyncResult["skipReason"] {
  switch (reason) {
    case "unchanged":
    case "not_applicable":
    case "connectivity":
    case "error":
      return reason
    default:
      return undefined
  }
}

function myreaderSkipReason(
  reason: string | undefined,
): MyReaderSyncResult["skipReason"] {
  return reason === "not_applicable" || reason === "error" ? reason : undefined
}

function invalidatePulledSidecar(libraryId: string, pulled: number): void {
  if (pulled === 0) return
  void Promise.all([
    invalidateFavoriteBooks(libraryId),
    invalidateReadingProgress(libraryId),
    invalidateReadingStatistics(libraryId),
    invalidateReaderAnnotations(libraryId),
    invalidateReaderBookmarks(libraryId),
    invalidateRecentlyReadBooks(libraryId),
  ])
}

/** 同步单个书库 — 所有业务路径的唯一 domain 入口。 */
export async function syncLibrary(
  library: Library,
  dataSources: DataSource[],
  options: SyncLibraryOptions = {},
): Promise<LibrarySyncReport> {
  const startedAt = Date.now()
  const throwOnFailure = options.throwOnFailure ?? false

  let ctx
  try {
    ctx = await openSyncContext(library, dataSources)
  } catch (err) {
    const message = describeError(err)
    const report = failedReport(library, options, message, startedAt)
    if (throwOnFailure) throw err instanceof Error ? err : new Error(message)
    return report
  }

  const syncCore = (libraryRootUri: string) =>
    runCoreLibrarySync({
      library,
      libraryRootUri,
      nowMs: Date.now(),
      scope: options.scope ?? "all",
      forceCalibre: options.forceCalibre ?? false,
      mode: options.myreaderMode ?? "full",
      storage: ctx.libraryStorage,
      taskId: options.myreaderTaskId,
      onSidecarComplete: ({ pulled }) =>
        invalidatePulledSidecar(library.id, pulled),
    })

  let coreReport
  let safBooks: Awaited<ReturnType<typeof fetchBooks>> | undefined
  try {
    if (isAndroidSafLibrary(library) && library.sourcePath) {
      await pullAndroidSafControl(library.sourcePath, library.path)
    }
    coreReport =
      ctx.backend.kind === "local-direct"
        ? await withLocalLibraryContentRoot(library, syncCore)
        : await syncCore(ctx.libraryRootUri)
    if (isAndroidSafLibrary(library) && !coreReport.error) {
      await pushAndroidSafControl(library)
      safBooks = await fetchBooks(coreReport.calibre.library, dataSources)
      await reconcileAndroidSafBooks(
        library,
        managedBookRelativePaths(safBooks),
      )
    }
  } catch (err) {
    const message = describeError(err)
    if (throwOnFailure) throw err instanceof Error ? err : new Error(message)
    return failedReport(
      library,
      options,
      message,
      startedAt,
      err instanceof DataIntegrityError ? "data_integrity" : undefined,
    )
  }

  let books = safBooks
  if (!books && coreReport.calibre.changed && !coreReport.calibre.error) {
    try {
      books = await fetchBooks(coreReport.calibre.library, dataSources)
    } catch (error) {
      console.warn("[reading-sync] books:refresh-failed", {
        libraryId: library.id,
        error: describeError(error),
      })
    }
  }

  const report: LibrarySyncReport = {
    libraryId: coreReport.libraryId,
    libraryName: coreReport.libraryName,
    durationMs: coreReport.durationMs,
    error: coreReport.error,
    failureKind: coreReport.failureKind,
    calibre: {
      skipped: coreReport.calibre.skipped,
      skipReason: calibreSkipReason(coreReport.calibre.skipReason),
      changed: coreReport.calibre.changed,
      library: coreReport.calibre.library,
      books,
      error: coreReport.calibre.error,
    },
    myreader: {
      skipped: coreReport.myreader.skipped,
      skipReason: myreaderSkipReason(coreReport.myreader.skipReason),
      mode: coreReport.myreader.mode,
      providers: coreReport.myreader.skipped
        ? {}
        : {
            "library-sidecar": {
              pushed: coreReport.myreader.pushed,
              pulled: coreReport.myreader.pulled,
            },
          },
      error: coreReport.myreader.error,
      failureKind: coreReport.myreader.failureKind,
    },
  }

  if (report.error && throwOnFailure) {
    if (report.failureKind === "connectivity") {
      throw new SyncConnectivityError(report.error, report)
    }
    if (report.failureKind === "data_integrity") {
      throw new DataIntegrityError(report.error)
    }
    throw new Error(report.error)
  }

  return report
}

/** 同步多个书库 — SyncRuntime / scheduler 用。 */
export async function syncLibraries(
  deps: SyncLibrariesDeps,
  trigger: SyncTrigger,
  policy: SyncTriggerPolicy = DEFAULT_SYNC_POLICY,
  scheduledTarget?: ScheduledSyncTarget,
  overrides?: Partial<SyncLibraryOptions>,
): Promise<SyncRunReport> {
  const startedAt = Date.now()

  if (trigger === "startup" && !deps.syncOnStartup) {
    return {
      trigger,
      startedAt,
      finishedAt: startedAt,
      durationMs: 0,
      results: [],
      aborted: true,
    }
  }

  if (trigger === "scheduled" && !deps.enableAutoSync) {
    return {
      trigger,
      startedAt,
      finishedAt: startedAt,
      durationMs: 0,
      results: [],
      aborted: true,
    }
  }

  const options = mergeOptions(trigger, policy, scheduledTarget, overrides)
  const entry = resolveSyncOptions(trigger, policy, scheduledTarget)
  if (!entry) {
    return {
      trigger,
      startedAt,
      finishedAt: startedAt,
      durationMs: 0,
      results: [],
      aborted: true,
    }
  }

  const libraries =
    trigger === "scheduled" && scheduledTarget === "reading"
      ? deps.libraries.filter((library) => library.id === deps.activeLibraryId)
      : deps.libraries

  const results: LibrarySyncReport[] = []
  for (const library of libraries) {
    if (
      trigger === "scheduled" &&
      scheduledTarget === "reading" &&
      !deps.activeLibraryId
    ) {
      continue
    }
    const report = await syncLibrary(library, deps.dataSources, options)
    results.push(report)
  }

  const finishedAt = Date.now()
  return {
    trigger,
    startedAt,
    finishedAt,
    durationMs: finishedAt - startedAt,
    results,
  }
}
