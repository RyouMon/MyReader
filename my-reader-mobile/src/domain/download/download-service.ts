import { File } from "expo-file-system";

import type { DataSource, Library } from "../types";
import { AppInvariantError, DataIntegrityError } from "../../errors";

import { upsertFileState } from "../../repos/file_state";
import { openSyncContext, type SyncTargetContext } from "../sync/actions";
import { localFileUriFor } from "../../services/fs/path";
import {
  downloadFileDirectWithProgress,
  type DownloadOutcome,
} from "../sync/transfer";
import type { NativeDownloadOptions } from "../../services/download/native";

type BackgroundDownloadOptions = NativeDownloadOptions;

import i18n from "@/src/i18n";

export type DownloadProgressHandler = (received: number, total: number) => void;

export type LibraryDownloadRequest = {
  libraryId: string;
  relativePath: string;
  libraries: Library[];
  dataSources: DataSource[];
  onProgress?: DownloadProgressHandler;
  options?: BackgroundDownloadOptions;
};

/**
 * Opens a sync context for a library by looking it up from the provided lists.
 */
export async function openDownloadContextForLibrary(
  libraryId: string,
  libraries: Library[],
  dataSources: DataSource[],
): Promise<SyncTargetContext> {
  const library = libraries.find((item) => item.id === libraryId);
  if (!library) throw new AppInvariantError(i18n.t("sync.libraryNotFound", { id: libraryId }));
  return openSyncContext(library, dataSources);
}

/**
 * Downloads a cache file and commits the local `present` state in one place.
 */
export async function downloadLibraryFile({
  libraryId,
  relativePath,
  libraries,
  dataSources,
  onProgress,
  options,
}: LibraryDownloadRequest): Promise<DownloadOutcome> {
  const ctx = await openDownloadContextForLibrary(libraryId, libraries, dataSources);
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
  libraries: Library[],
  dataSources: DataSource[],
  onProgress?: DownloadProgressHandler,
): Promise<DownloadOutcome> {
  const ctx = await openDownloadContextForLibrary(libraryId, libraries, dataSources);
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