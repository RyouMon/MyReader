import type { SyncTargetContext } from "./context"
import type {
  MyReaderSyncMode,
  MyReaderSyncProvider,
  MyReaderSyncResult,
  SyncLibraryOptions,
} from "./types"
import { describeError } from "../../utils/common"
import {
  pullLibrarySidecarSegments,
  publishLibrarySidecarSegments,
} from "./library-sidecar/kernel"
import { ensureLibrarySidecarIdentity } from "./library-sidecar/identity"
import { applyLibrarySidecarSegment } from "./library-sidecar/projection"
import {
  invalidateFavoriteBooks,
  invalidateReadingProgress,
  invalidateRecentlyReadBooks,
} from "@/src/services/query/invalidate-table"
import { withLocalLibraryCalibreRoot } from "../library/local-library-content"

const librarySidecarProvider: MyReaderSyncProvider = {
  id: "library-sidecar.v4",
  async push(ctx) {
    await ensureLibrarySidecarIdentity(ctx.library)
    return publishLibrarySidecarSegments(ctx.library, ctx.backend, Date.now())
  },
  async pull(ctx) {
    const nowMs = Date.now()
    const identity = await ensureLibrarySidecarIdentity(ctx.library)
    const pulled = await pullLibrarySidecarSegments(
      ctx.library,
      ctx.backend,
      identity,
      (tx, segment) =>
        applyLibrarySidecarSegment(tx, segment, identity.replicaId, nowMs),
      nowMs,
    )
    if (pulled > 0) {
      await Promise.all([
        invalidateFavoriteBooks(ctx.library.id),
        invalidateReadingProgress(ctx.library.id),
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

/** Syncs the v4 sidecar stream for the current library. */
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
