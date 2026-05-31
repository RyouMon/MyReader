import { syncDbFromContext } from "./db-sync";
import type { SyncTargetContext } from "./context";
import type { MyReaderSyncMode, MyReaderSyncProvider, MyReaderSyncResult, SyncLibraryOptions } from "./types";
import { describeError } from "../../utils/common";

const readingProgressProvider: MyReaderSyncProvider = {
  id: "reading_progress",
  push(ctx) {
    return syncDbFromContext(ctx.library, ctx, { mode: "push_only" }).then((r) => r.pushed);
  },
  pull(ctx) {
    return syncDbFromContext(ctx.library, ctx, { mode: "pull_only" }).then((r) => r.pulled);
  },
};

const PROVIDERS: MyReaderSyncProvider[] = [readingProgressProvider];

/** Phase B — MyReader 同步：push/pull `.myreader/changes/`（本地与远程同一编排）。 */
export async function syncMyReader(
  ctx: SyncTargetContext,
  options?: Pick<SyncLibraryOptions, "myreaderMode">,
): Promise<MyReaderSyncResult> {
  const mode: MyReaderSyncMode = options?.myreaderMode ?? "full";
  const providers: MyReaderSyncResult["providers"] = {};

  try {
    for (const provider of PROVIDERS) {
      const pushed = await provider.push(ctx);
      const pulled = mode === "full" ? await provider.pull(ctx) : 0;
      providers[provider.id] = { pushed, pulled };
    }

    return { skipped: false, mode, providers };
  } catch (err) {
    return {
      skipped: true,
      skipReason: "error",
      mode,
      providers,
      error: describeError(err),
    };
  }
}

export function skippedMyreader(mode: MyReaderSyncMode = "full"): MyReaderSyncResult {
  return {
    skipped: true,
    skipReason: "not_applicable",
    mode,
    providers: {},
  };
}
