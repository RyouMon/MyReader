import { Directory, File } from "expo-file-system";
import { deleteAsync, makeDirectoryAsync } from "expo-file-system/legacy";

import type { RemoteBackend } from "../../services/remote/backend";
import { isRemoteBackend } from "./resolve";
import { localFileUriFor, resolveLibraryBooksDir, parentDirectoryUriForFileUri } from "../../services/fs/path";
import { AppInvariantError, DataIntegrityError } from "../../errors";
import { clearExtractedReaderCachesForArchiveUri } from "../../services/fs/cache";
import {
  startNativeDownload,
  type NativeDownloadOptions,
} from "../../services/download/native";
import { upsertFileState, deleteFileState } from "../../repos/file_state";
import type { Library } from "../types";
import type { SyncTargetContext } from "./context";
import i18n from "@/src/i18n";

export type DownloadOutcome = {
  blake3: string | null;
  size: number;
  mtimeMs: number;
};

type BackgroundDownloadOptions = NativeDownloadOptions;

function assertSafeRelative(relativePath: string): void {
  if (!relativePath) {
    throw new AppInvariantError(i18n.t("sync.syncPathEmpty"));
  }
  if (relativePath.includes("..")) {
    throw new AppInvariantError(i18n.t("sync.syncPathTraversal", { path: relativePath }));
  }
  if (relativePath.startsWith("/")) {
    throw new AppInvariantError(i18n.t("sync.syncPathAbsolute", { path: relativePath }));
  }
}

function uriToFile(uri: string): File {
  return new File(uri);
}

function outcomeFromFileWithoutHash(file: File): DownloadOutcome {
  return {
    blake3: null,
    size: file.size ?? 0,
    mtimeMs: file.modificationTime ? file.modificationTime * 1000 : Date.now(),
  };
}

function hasNonEmptyFileBytes(file: File): boolean {
  return file.exists && (file.size ?? 0) > 0;
}

function outcomeFromNativeDownload(file: File, bytesDownloaded: number, relativePath: string): DownloadOutcome {
  if (!file.exists) {
    throw new DataIntegrityError(i18n.t("sync.nativeDownloadMissing", { path: relativePath }));
  }
  const size = file.size ?? 0;
  if (size <= 0) {
    throw new DataIntegrityError(i18n.t("sync.nativeDownloadEmpty", { path: relativePath }));
  }
  if (bytesDownloaded > 0 && size !== bytesDownloaded) {
    console.warn("Native download byte count differs from filesystem size:", {
      relativePath,
      bytesDownloaded,
      fileSize: size,
      fileUri: file.uri,
    });
  }
  return outcomeFromFileWithoutHash(file);
}

async function ensureParentDirFor(uri: string): Promise<void> {
  const parentPath = parentDirectoryUriForFileUri(uri);
  if (!parentPath) return;
  const parent = new Directory(parentPath);
  if (!parent.exists) {
    await makeDirectoryAsync(parentPath, { intermediates: true });
  }
}

async function deleteFileIfExists(file: File): Promise<void> {
  if (file.exists) {
    await deleteAsync(file.uri, { idempotent: true });
  }
}

async function downloadWithBackgroundTask(
  backend: RemoteBackend,
  relativePath: string,
  destUri: string,
  onProgress?: (received: number, total: number) => void,
  options: BackgroundDownloadOptions = {},
): Promise<number> {
  const request = await backend.getDownloadRequest(relativePath, destUri);


  return startNativeDownload({
    relativePath,
    url: backend.contentUrl(relativePath),
    destinationUri: destUri,
    headers: request.headers,
    onProgress,
    options,
  }).then((result) => result.bytesDownloaded);
}

async function downloadFileDirectInternal(
  backend: RemoteBackend,
  libraryCacheDirUri: string,
  relativePath: string,
): Promise<DownloadOutcome> {
  assertSafeRelative(relativePath);

  const destUri = localFileUriFor(libraryCacheDirUri, relativePath);
  const destFile = uriToFile(destUri);

  if (hasNonEmptyFileBytes(destFile)) {
    return outcomeFromFileWithoutHash(destFile);
  }
  if (destFile.exists) {
    await deleteFileIfExists(destFile);
  }

  return downloadFileDirectWithProgressInternal(backend, libraryCacheDirUri, relativePath);
}

async function downloadFileDirectWithProgressInternal(
  backend: RemoteBackend,
  libraryCacheDirUri: string,
  relativePath: string,
  onProgress?: (received: number, total: number) => void,
  options: BackgroundDownloadOptions = {},
): Promise<DownloadOutcome> {
  assertSafeRelative(relativePath);
  const destUri = localFileUriFor(libraryCacheDirUri, relativePath);
  const destFile = uriToFile(destUri);

  if (hasNonEmptyFileBytes(destFile)) {
    const size = destFile.size ?? 0;
    onProgress?.(size, size);
    return outcomeFromFileWithoutHash(destFile);
  }
  if (destFile.exists) {
    await deleteFileIfExists(destFile);
  }

  await ensureParentDirFor(destUri);
  try {
    const bytesDownloaded = await downloadWithBackgroundTask(backend, relativePath, destUri, onProgress, options);
    const written = uriToFile(destUri);
    const outcome = outcomeFromNativeDownload(written, bytesDownloaded, relativePath);
    return outcome;
  } catch (err) {
    const partial = uriToFile(destUri);
    await deleteFileIfExists(partial);
    throw err;
  }
}

// ─── Public API (with file_state upserts) ────────────────────────────────

export async function downloadFileDirect(
  ctx: SyncTargetContext,
  relativePath: string,
): Promise<DownloadOutcome> {
  if (!isRemoteBackend(ctx.backend)) {
    throw new AppInvariantError(i18n.t("sync.nativeDownloadNotSupported", { kind: ctx.backend.kind }));
  }
  const outcome = await downloadFileDirectInternal(ctx.backend, ctx.libraryCacheDirUri, relativePath);
  await upsertFileState(ctx.library, relativePath, {
    localState: "present",
    localBlake3: outcome.blake3,
    localSize: outcome.size,
    localMtime: outcome.mtimeMs,
  });
  return outcome;
}

export async function downloadFileDirectWithProgress(
  ctx: SyncTargetContext,
  relativePath: string,
  onProgress?: (received: number, total: number) => void,
  options: BackgroundDownloadOptions = {},
): Promise<DownloadOutcome> {
  if (!isRemoteBackend(ctx.backend)) {
    throw new AppInvariantError(i18n.t("sync.nativeDownloadNotSupported", { kind: ctx.backend.kind }));
  }
  const outcome = await downloadFileDirectWithProgressInternal(
    ctx.backend, ctx.libraryCacheDirUri, relativePath, onProgress, options,
  );
  await upsertFileState(ctx.library, relativePath, {
    localState: "present",
    localBlake3: outcome.blake3,
    localSize: outcome.size,
    localMtime: outcome.mtimeMs,
  });
  return outcome;
}

export async function evictLocalFile(
  ctx: SyncTargetContext,
  relativePath: string,
): Promise<void> {
  assertSafeRelative(relativePath);
  const file = uriToFile(localFileUriFor(ctx.libraryCacheDirUri, relativePath));
  await deleteFileIfExists(file);
  await clearExtractedReaderCachesForArchiveUri(file.uri);
  await upsertFileState(ctx.library, relativePath, {
    localState: "remote_only",
    localBlake3: null,
    localSize: null,
    localMtime: null,
  });
}

export async function evictLocalFileOfflineSafe(
  library: Library,
  relativePath: string,
): Promise<void> {
  const libraryCacheDirUri = resolveLibraryBooksDir(library.id);
  assertSafeRelative(relativePath);
  const file = uriToFile(localFileUriFor(libraryCacheDirUri, relativePath));
  await deleteFileIfExists(file);
  await clearExtractedReaderCachesForArchiveUri(file.uri);
  await upsertFileState(library, relativePath, {
    localState: "remote_only",
    localBlake3: null,
    localSize: null,
    localMtime: null,
  });
}

export async function deleteFileEverywhere(
  ctx: SyncTargetContext,
  relativePath: string,
): Promise<void> {
  const backend = ctx.backend;
  assertSafeRelative(relativePath);

  const localFile = uriToFile(localFileUriFor(ctx.libraryCacheDirUri, relativePath));
  await deleteFileIfExists(localFile);
  await clearExtractedReaderCachesForArchiveUri(localFile.uri);

  await backend.deleteRemote(relativePath);

  await deleteFileState(ctx.library, relativePath);
}