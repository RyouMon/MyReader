import type { DataSource, Library } from "../types"
import { SyncConnectivityError } from "../../errors"
import i18n from "@/src/i18n"
import { describeError } from "../../utils/common"

import { checkConnectivity } from "./connectivity"
import { skippedCalibre, syncCalibre } from "./calibre-sync"
import { openSyncContext } from "./context"
import { skippedMyreader, syncMyReader } from "./myreader-sync"
import {
  DEFAULT_SYNC_POLICY,
  resolveSyncOptions,
  scopeHasCalibre,
  scopeHasMyreader,
} from "./policy"
import { isRemoteBackend } from "./resolve"
import type {
  LibrarySyncReport,
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

function buildConnectivityFailureReport(
  library: Library,
  options: SyncLibraryOptions,
  errorMessage: string,
  startedAt: number,
): LibrarySyncReport {
  const mode = options.myreaderMode ?? "full"
  return {
    libraryId: library.id,
    libraryName: library.name,
    durationMs: Date.now() - startedAt,
    error: errorMessage,
    calibre: {
      skipped: true,
      skipReason: "connectivity",
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
  }
}

/** 同步单个书库 — 所有业务路径的唯一 domain 入口。 */
export async function syncLibrary(
  library: Library,
  dataSources: DataSource[],
  options: SyncLibraryOptions = {},
): Promise<LibrarySyncReport> {
  const startedAt = Date.now()
  const scope = options.scope ?? "all"
  const throwOnFailure = options.throwOnFailure ?? false

  let ctx
  try {
    ctx = await openSyncContext(library, dataSources)
  } catch (err) {
    const message = describeError(err)
    const report: LibrarySyncReport = {
      libraryId: library.id,
      libraryName: library.name,
      durationMs: Date.now() - startedAt,
      error: message,
      calibre: {
        skipped: true,
        skipReason: "error",
        changed: false,
        library,
        error: message,
      },
      myreader: skippedMyreader(options.myreaderMode),
    }
    if (throwOnFailure) throw err instanceof Error ? err : new Error(message)
    return report
  }

  if (isRemoteBackend(ctx.backend)) {
    const connectivity = await checkConnectivity(ctx.backend)
    if (!connectivity.reachable) {
      const message = connectivity.error ?? i18n.t("sync.sourceUnreachable")
      const report = buildConnectivityFailureReport(
        library,
        options,
        message,
        startedAt,
      )
      if (throwOnFailure) {
        throw new SyncConnectivityError(message, report)
      }
      return report
    }
  }

  let calibre = scopeHasCalibre(options)
    ? await syncCalibre(ctx, dataSources, options)
    : skippedCalibre(library)

  const myreaderContext =
    calibre.library === ctx.library ? ctx : { ...ctx, library: calibre.library }
  let myreader = scopeHasMyreader(options)
    ? await syncMyReader(myreaderContext, options)
    : skippedMyreader(options.myreaderMode ?? "full")

  if (calibre.error && throwOnFailure) {
    throw new Error(calibre.error)
  }
  if (myreader.error && throwOnFailure) {
    throw new Error(myreader.error)
  }

  return {
    libraryId: library.id,
    libraryName: library.name,
    calibre,
    myreader,
    durationMs: Date.now() - startedAt,
  }
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
