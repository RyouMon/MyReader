import { File } from "expo-file-system";

import type { Library } from "../data/types";
import { AppInvariantError, DataIntegrityError } from "../errors";
import { useAppStore } from "../store/app-store";

import { upsertFileState } from "../data/file_state";
import { openSyncContext, type SyncTargetContext } from "./actions";
import { isTransferBackend, localFileUriFor } from "./backend";
import {
  downloadFileDirectWithProgress as downloadCacheFileDirectWithProgress,
  type BackgroundDownloadOptions,
  type DownloadOutcome,
} from "./file_ops";

import i18n from "@/src/i18n";

export type DownloadProgressHandler = (received: number, total: number) => void;

export type LibraryDownloadRequest = {
  libraryId: string;
  relativePath: string;
  onProgress?: DownloadProgressHandler;
  options?: BackgroundDownloadOptions;
};

/**
 * Opens the current app-store library snapshot for queue-driven download work.
 */
export async function openDownloadContextForLibrary(libraryId: string): Promise<SyncTargetContext> {
  const { libraries, dataSources } = useAppStore.getState();
  const library = libraries.find((item: Library) => item.id === libraryId);
  if (!library) throw new AppInvariantError(i18n.t("sync.libraryNotFound", { id: libraryId }));
  return openSyncContext(library, dataSources);
}

/**
 * Downloads a cache file and commits the local `present` state in one place.
 */
export async function downloadLibraryFile({
  libraryId,
  relativePath,
  onProgress,
  options,
}: LibraryDownloadRequest): Promise<DownloadOutcome> {
  const ctx = await openDownloadContextForLibrary(libraryId);
  return downloadContextFile(ctx, relativePath, onProgress, options);
}

/**
 * Downloads a file for an already opened sync context and records its local state.
 */
export async function downloadContextFile(
  ctx: SyncTargetContext,
  relativePath: string,
  onProgress?: DownloadProgressHandler,
  options: BackgroundDownloadOptions = {},
): Promise<DownloadOutcome> {
  if (!isTransferBackend(ctx.backend)) {
    throw new AppInvariantError(i18n.t("sync.nativeDownloadNotSupported", { kind: ctx.backend.kind }));
  }
  const outcome = await downloadCacheFileDirectWithProgress(
    ctx.backend,
    ctx.libraryCacheDirUri,
    relativePath,
    onProgress,
    options,
  );
  await commitDownloadOutcome(ctx, relativePath, outcome);
  return outcome;
}

/**
 * Replays completion side effects for a native task that already wrote its file.
 */
export async function finalizeRecoveredDownload(
  libraryId: string,
  relativePath: string,
  onProgress?: DownloadProgressHandler,
): Promise<DownloadOutcome> {
  const ctx = await openDownloadContextForLibrary(libraryId);
  const outcome = readCachedDownloadOutcome(ctx, relativePath);
  onProgress?.(outcome.size, outcome.size);
  await commitDownloadOutcome(ctx, relativePath, outcome);
  return outcome;
}

/**
 * Persists the file_state row shared by normal and recovered downloads.
 */
export async function commitDownloadOutcome(
  ctx: SyncTargetContext,
  relativePath: string,
  outcome: DownloadOutcome,
): Promise<void> {
  await upsertFileState(ctx.library, relativePath, {
    localState: "present",
    localBlake3: outcome.blake3,
    localSize: outcome.size,
    localMtime: outcome.mtimeMs,
  });
}

/**
 * Reads the bytes metadata expected after a recovered native task reaches DONE.
 */
function readCachedDownloadOutcome(ctx: SyncTargetContext, relativePath: string): DownloadOutcome {
  const file = new File(localFileUriFor(ctx.libraryCacheDirUri, relativePath));
  if (!file.exists) {
    throw new DataIntegrityError(i18n.t("sync.nativeDownloadMissing", { path: relativePath }));
  }
  return {
    blake3: null,
    size: file.size ?? 0,
    mtimeMs: file.modificationTime ? file.modificationTime * 1000 : Date.now(),
  };
}