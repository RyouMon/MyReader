import type { SyncTargetContext } from "./context"
import type {
  MyReaderSyncMode,
  MyReaderSyncResult,
  SyncLibraryOptions,
} from "./types"
import { describeError } from "../../utils/common"
import { ensureLibrarySidecarIdentity } from "./library-sidecar/identity"
import { readLibrarySidecarAutomergeDiagnosticSnapshot } from "./library-sidecar/database-store"
import { syncLibrarySidecarDatabase } from "./library-sidecar/sync-database"
import {
  invalidateFavoriteBooks,
  invalidateReadingProgress,
  invalidateReadingStatistics,
  invalidateReaderAnnotations,
  invalidateReaderBookmarks,
  invalidateRecentlyReadBooks,
} from "@/src/services/query/invalidate-table"
import { withLocalLibraryCalibreRoot } from "../library/local-library-content"
import { markLibrarySidecarSyncSucceeded } from "@/src/repos/library-sidecar-schedule"

async function logAutomergeDiagnostics(
  ctx: SyncTargetContext,
  event: "complete" | "failed",
): Promise<void> {
  try {
    const diagnostics = await readLibrarySidecarAutomergeDiagnosticSnapshot(
      ctx.library,
    )
    console.info(`[reading-sync] automerge:${event}`, {
      libraryId: ctx.library.id,
      backend: ctx.backend.kind,
      ...diagnostics,
    })
  } catch (error) {
    console.warn("[reading-sync] automerge:diagnostics-failed", {
      libraryId: ctx.library.id,
      error: describeError(error),
    })
  }
}

async function syncProviders(
  ctx: SyncTargetContext,
  mode: MyReaderSyncMode,
  providers: MyReaderSyncResult["providers"],
  taskId?: string,
): Promise<MyReaderSyncResult> {
  const providerId = "library-sidecar"
  console.info("[reading-sync] provider:start", {
    libraryId: ctx.library.id,
    provider: providerId,
    mode,
    backend: ctx.backend.kind,
  })
  const identity = await ensureLibrarySidecarIdentity(ctx.library)
  const syncArguments = [
    ctx.library,
    identity,
    Date.now(),
    mode,
    ctx.sidecarStorage,
  ] as const
  const report = taskId
    ? await syncLibrarySidecarDatabase(...syncArguments, { taskId })
    : await syncLibrarySidecarDatabase(...syncArguments)
  providers[providerId] = report
  if (report.pulled > 0) {
    await Promise.all([
      invalidateFavoriteBooks(ctx.library.id),
      invalidateReadingProgress(ctx.library.id),
      invalidateReadingStatistics(ctx.library.id),
      invalidateReaderAnnotations(ctx.library.id),
      invalidateReaderBookmarks(ctx.library.id),
      invalidateRecentlyReadBooks(ctx.library.id),
    ])
  }
  console.info("[reading-sync] provider:complete", {
    libraryId: ctx.library.id,
    provider: providerId,
    mode,
    ...report,
  })
  await markLibrarySidecarSyncSucceeded(
    ctx.library,
    mode === "full" ? Date.now() : null,
  )
  return { skipped: false, mode, providers }
}

/** Syncs the Automerge sidecar stream for the current library. */
export async function syncMyReader(
  ctx: SyncTargetContext,
  options?: Pick<SyncLibraryOptions, "myreaderMode" | "myreaderTaskId">,
): Promise<MyReaderSyncResult> {
  const mode: MyReaderSyncMode = options?.myreaderMode ?? "full"
  const providers: MyReaderSyncResult["providers"] = {}
  console.info("[reading-sync] sync:start", {
    libraryId: ctx.library.id,
    mode,
    backend: ctx.backend.kind,
  })
  try {
    let result: MyReaderSyncResult
    if (
      ctx.backend.kind === "local-direct" &&
      ctx.library.securityScopedBookmark
    ) {
      result = await withLocalLibraryCalibreRoot(ctx.library, () =>
        syncProviders(ctx, mode, providers, options?.myreaderTaskId),
      )
    } else {
      result = await syncProviders(
        ctx,
        mode,
        providers,
        options?.myreaderTaskId,
      )
    }
    await logAutomergeDiagnostics(ctx, "complete")
    return result
  } catch (err) {
    await logAutomergeDiagnostics(ctx, "failed")
    console.error("[reading-sync] sync:failed", {
      libraryId: ctx.library.id,
      mode,
      backend: ctx.backend.kind,
      providers,
      error: describeError(err),
    })
    return {
      skipped: true,
      skipReason: "error",
      mode,
      providers,
      error: describeError(err),
    }
  }
}

export function skippedMyreader(
  mode: MyReaderSyncMode = "full",
): MyReaderSyncResult {
  return {
    skipped: true,
    skipReason: "not_applicable",
    mode,
    providers: {},
  }
}
