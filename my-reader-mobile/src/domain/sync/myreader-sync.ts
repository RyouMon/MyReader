import type { SyncTargetContext } from "./context"
import type {
  MyReaderSyncMode,
  MyReaderSyncProvider,
  MyReaderSyncResult,
  SyncLibraryOptions,
} from "./types"
import { describeError } from "../../utils/common"
import { ensureLibrarySidecarIdentity } from "./library-sidecar/identity"
import {
  ensureLibrarySidecarAutomergeState,
  publishLibrarySidecarAutomergeChanges,
  pullLibrarySidecarAutomergeChanges,
} from "./library-sidecar/automerge-store"
import { projectLibrarySidecarAutomergeDocument } from "./library-sidecar/automerge-projection"
import {
  invalidateFavoriteBooks,
  invalidateReadingProgress,
  invalidateReadingStatistics,
  invalidateReaderAnnotations,
  invalidateReaderBookmarks,
  invalidateRecentlyReadBooks,
} from "@/src/services/query/invalidate-table"
import { withLocalLibraryCalibreRoot } from "../library/local-library-content"

const librarySidecarProvider: MyReaderSyncProvider = {
  id: "library-sidecar",
  async push(ctx) {
    const identity = await ensureLibrarySidecarIdentity(ctx.library)
    const nowMs = Date.now()
    await ensureLibrarySidecarAutomergeState(ctx.library, identity, nowMs)
    const automergePushed = await publishLibrarySidecarAutomergeChanges(
      ctx.library,
      ctx.backend,
      nowMs,
    )
    return automergePushed
  },
  async pull(ctx) {
    const nowMs = Date.now()
    const identity = await ensureLibrarySidecarIdentity(ctx.library)
    const automergePulled = await pullLibrarySidecarAutomergeChanges(
      ctx.library,
      ctx.backend,
      identity,
      nowMs,
      projectLibrarySidecarAutomergeDocument,
    )
    const pulled = automergePulled
    if (pulled > 0) {
      await Promise.all([
        invalidateFavoriteBooks(ctx.library.id),
        invalidateReadingProgress(ctx.library.id),
        invalidateReadingStatistics(ctx.library.id),
        invalidateReaderAnnotations(ctx.library.id),
        invalidateReaderBookmarks(ctx.library.id),
        invalidateRecentlyReadBooks(ctx.library.id),
      ])
    }
    return pulled
  },
}

const PROVIDERS: MyReaderSyncProvider[] = [librarySidecarProvider]

async function syncProviders(
  ctx: SyncTargetContext,
  mode: MyReaderSyncMode,
  providers: MyReaderSyncResult["providers"],
): Promise<MyReaderSyncResult> {
  for (const provider of PROVIDERS) {
    console.info("[reading-sync] provider:start", {
      libraryId: ctx.library.id,
      provider: provider.id,
      mode,
      backend: ctx.backend.kind,
    })
    const pushed = await provider.push(ctx)
    const pulled = mode === "full" ? await provider.pull(ctx) : 0
    providers[provider.id] = { pushed, pulled }
    console.info("[reading-sync] provider:complete", {
      libraryId: ctx.library.id,
      provider: provider.id,
      mode,
      pushed,
      pulled,
    })
  }
  return { skipped: false, mode, providers }
}

/** Syncs the Automerge sidecar stream for the current library. */
export async function syncMyReader(
  ctx: SyncTargetContext,
  options?: Pick<SyncLibraryOptions, "myreaderMode">,
): Promise<MyReaderSyncResult> {
  const mode: MyReaderSyncMode = options?.myreaderMode ?? "full"
  const providers: MyReaderSyncResult["providers"] = {}
  console.info("[reading-sync] sync:start", {
    libraryId: ctx.library.id,
    mode,
    backend: ctx.backend.kind,
  })
  try {
    if (
      ctx.backend.kind === "local-direct" &&
      ctx.library.securityScopedBookmark
    ) {
      return await withLocalLibraryCalibreRoot(ctx.library, () =>
        syncProviders(ctx, mode, providers),
      )
    }
    return await syncProviders(ctx, mode, providers)
  } catch (err) {
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
