import { File } from "expo-file-system";

import type { Library } from "../types";
import { AppInvariantError, DataIntegrityError } from "../../errors";
import { useAppStore } from "../../store/app-store";

import { upsertFileState } from "../../repos/file_state";
import { openSyncContext, type SyncTargetContext } from "../sync/actions";
import { localFileUriFor } from "../../services/fs/path";
import {
  downloadFileDirectWithProgress,
  type BackgroundDownloadOptions,
  type DownloadOutcome,
} from "../sync/transfer";

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
  return downloadFileDirectWithProgress(ctx, relativePath, onProgress, options);
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
  await upsertFileState(ctx.library, relativePath, {
    localState: "present",
    localBlake3: outcome.blake3,
    localSize: outcome.size,
    localMtime: outcome.mtimeMs,
  });
  return outcome;
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