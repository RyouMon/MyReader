import { blake3 } from "@noble/hashes/blake3.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { Directory, File } from "expo-file-system";
import { deleteAsync, makeDirectoryAsync } from "expo-file-system/legacy";

import type { RemoteFileOps, TransferBackend } from "./backend";
import { isTransferBackend, localFileUriFor, resolveLibraryBooksDir } from "./backend";
import { AppInvariantError, DataIntegrityError } from "../errors";
import type { Manifest, ManifestEntry } from "./manifest";
import { findEntry, removeEntry, saveManifest } from "./manifest";
import { clearExtractedReaderCachesForArchiveUri } from "../services/fs/cache";
import {
  startNativeDownload,
  startNativeUpload,
  type NativeDownloadOptions,
  type NativeUploadOptions,
} from "../services/download/native";
import { parentDirectoryUriForFileUri } from "../services/fs/path";
import { upsertFileState, deleteFileState } from "../data/file_state";
import type { Library } from "../data/types";
import type { SyncTargetContext } from "./context";
import i18n from "@/src/i18n";

export type DownloadOutcome = {
  blake3: string | null;
  size: number;
  mtimeMs: number;
};

export type DownloadResult = {
  entry: ManifestEntry;
  outcome: DownloadOutcome;
};

export type BackgroundDownloadOptions = NativeDownloadOptions;
export type BackgroundUploadOptions = NativeUploadOptions;

type PushFileOptions = {
  required?: boolean;
  onProgress?: (sent: number, total: number) => void;
  upload?: BackgroundUploadOptions;
};

const HASH_CHUNK_BYTES = 1024 * 1024;

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function blake3Hex(bytes: Uint8Array): string {
  return bytesToHex(blake3(bytes));
}

async function blake3HexFile(file: File): Promise<string> {
  const size = file.size ?? 0;
  if (size <= HASH_CHUNK_BYTES) {
    const bytes = await file.bytes();
    await yieldToEventLoop();
    return blake3Hex(bytes);
  }

  const hash = blake3.create();
  const handle = file.open();
  try {
    while ((handle.offset ?? 0) < size) {
      const remaining = size - (handle.offset ?? 0);
      hash.update(handle.readBytes(Math.min(HASH_CHUNK_BYTES, remaining)));
      await yieldToEventLoop();
    }
    return bytesToHex(hash.digest());
  } finally {
    handle.close();
  }
}

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

function downloadWithBackgroundTask(
  backend: TransferBackend,
  relativePath: string,
  destUri: string,
  onProgress?: (received: number, total: number) => void,
  options: BackgroundDownloadOptions = {},
): Promise<number> {
  const request = backend.getDownloadRequest(relativePath);

  console.info("Start to download remote file with native adapter, params:", {
    taskId: options.taskId ?? null,
    relativePath,
    destUri,
    hasHeaders: Boolean(request.headers && Object.keys(request.headers).length > 0),
  });

  return startNativeDownload({
    relativePath,
    url: request.url,
    destinationUri: destUri,
    headers: request.headers,
    onProgress,
    options,
  }).then((result) => result.bytesDownloaded);
}

async function uploadWithBackgroundTask(
  backend: TransferBackend,
  relativePath: string,
  sourceUri: string,
  onProgress?: (sent: number, total: number) => void,
  options: BackgroundUploadOptions = {},
): Promise<number> {
  const request = backend.getUploadRequest(relativePath);

  await backend.prepareUpload(relativePath);
  console.info("Start to upload local file with native adapter, params:", {
    taskId: options.taskId ?? null,
    relativePath,
    sourceUri,
    hasHeaders: Boolean(request.headers && Object.keys(request.headers).length > 0),
  });

  return startNativeUpload({
    relativePath,
    url: request.url,
    sourceUri,
    method: request.method,
    headers: request.headers,
    onProgress,
    options,
  }).then((result) => result.bytesUploaded);
}

// ─── Internal transfer ops (no file_state side effects) ─────────────────

async function downloadFileManifest(
  backend: TransferBackend,
  manifest: Manifest,
  libraryCacheDirUri: string,
  relativePath: string,
): Promise<DownloadOutcome> {
  assertSafeRelative(relativePath);
  const entry = findEntry(manifest, relativePath);
  if (!entry) {
    throw new AppInvariantError(i18n.t("sync.manifestNotRegistered", { path: relativePath }));
  }

  const destUri = localFileUriFor(libraryCacheDirUri, relativePath);
  const destFile = uriToFile(destUri);
  if (destFile.exists) {
    const hex = await blake3HexFile(destFile);
    if (hex === entry.blake3) {
      console.info("Success to use cached manifest file:", {
        relativePath,
        destUri,
        size: destFile.size ?? 0,
      });
      return {
        blake3: hex,
        size: destFile.size ?? 0,
        mtimeMs: destFile.modificationTime ? destFile.modificationTime * 1000 : Date.now(),
      };
    }
    console.warn("Failed to reuse cached manifest file because hash does not match:", {
      relativePath,
      destUri,
      expected: entry.blake3,
      actual: hex,
    });
    await deleteFileIfExists(destFile);
  }

  await ensureParentDirFor(destUri);
  console.info("Start to download manifest file with native downloader, params:", {
    relativePath,
    destUri,
  });
  await downloadWithBackgroundTask(backend, relativePath, destUri);
  const written = uriToFile(destUri);
  const hex = await blake3HexFile(written);
  if (hex !== entry.blake3) {
    await deleteFileIfExists(written);
    throw new DataIntegrityError(i18n.t("sync.hashMismatch", { expected: entry.blake3, actual: hex }));
  }
  console.info("Success to write manifest file to local cache:", {
    relativePath,
    destUri,
    size: written.size ?? 0,
  });

  return {
    blake3: hex,
    size: written.size ?? 0,
    mtimeMs: destFile.modificationTime ? destFile.modificationTime * 1000 : Date.now(),
  };
}

async function downloadFileDirectInternal(
  backend: TransferBackend,
  libraryCacheDirUri: string,
  relativePath: string,
): Promise<DownloadOutcome> {
  assertSafeRelative(relativePath);

  const destUri = localFileUriFor(libraryCacheDirUri, relativePath);
  const destFile = uriToFile(destUri);

  if (hasNonEmptyFileBytes(destFile)) {
    console.info("Success to use cached direct download file:", {
      relativePath,
      destUri,
      size: destFile.size ?? 0,
    });
    return outcomeFromFileWithoutHash(destFile);
  }
  if (destFile.exists) {
    await deleteFileIfExists(destFile);
  }

  return downloadFileDirectWithProgressInternal(backend, libraryCacheDirUri, relativePath);
}

async function downloadFileDirectWithProgressInternal(
  backend: TransferBackend,
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
    console.info("Success to use cached progress download file:", {
      relativePath,
      destUri,
      size,
    });
    return outcomeFromFileWithoutHash(destFile);
  }
  if (destFile.exists) {
    await deleteFileIfExists(destFile);
  }

  await ensureParentDirFor(destUri);
  console.info("Start native download to local cache, params:", {
    relativePath,
    destUri,
  });
  try {
    const bytesDownloaded = await downloadWithBackgroundTask(backend, relativePath, destUri, onProgress, options);
    const written = uriToFile(destUri);
    const outcome = outcomeFromNativeDownload(written, bytesDownloaded, relativePath);
    console.info("Success to finish native download to local cache:", {
      relativePath,
      destUri,
      size: outcome.size,
    });
    return outcome;
  } catch (err) {
    const partial = uriToFile(destUri);
    await deleteFileIfExists(partial);
    throw err;
  }
}

// ─── Public API (with file_state upserts) ────────────────────────────────

/** Download + record `present` state so the UI button reflects reality. */
export async function downloadFile(
  ctx: SyncTargetContext,
  relativePath: string,
): Promise<DownloadResult> {
  if (!isTransferBackend(ctx.backend)) {
    throw new AppInvariantError(i18n.t("sync.nativeDownloadNotSupported", { kind: ctx.backend.kind }));
  }
  console.info("Start to download manifest-backed file, params:", {
    libraryId: ctx.libraryId,
    dataSourceId: ctx.dataSourceId,
    relativePath,
  });
  const entry = findEntry(ctx.manifest, relativePath);
  if (!entry) {
    console.error("Failed to find manifest entry before download:", {
      libraryId: ctx.libraryId,
      relativePath,
    });
    throw new AppInvariantError(i18n.t("sync.manifestNotRegistered", { path: relativePath }));
  }
  const outcome = await downloadFileManifest(
    ctx.backend, ctx.manifest, ctx.libraryCacheDirUri, relativePath,
  );
  await upsertFileState(ctx.library, relativePath, {
    localState: "present",
    localBlake3: outcome.blake3,
    localSize: outcome.size,
    localMtime: outcome.mtimeMs,
  });
  console.info("Success to download manifest-backed file:", {
    libraryId: ctx.libraryId,
    relativePath,
    size: outcome.size,
    blake3: outcome.blake3,
  });
  return { entry, outcome };
}

/** Download a file directly without requiring a manifest entry. */
export async function downloadFileDirect(
  ctx: SyncTargetContext,
  relativePath: string,
): Promise<DownloadOutcome> {
  if (!isTransferBackend(ctx.backend)) {
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
  if (!isTransferBackend(ctx.backend)) {
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

/** Flip a path back to `remote_only` (local file removed, manifest preserved). */
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

/** Offline-safe variant: evict local file without touching the backend. */
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

/** Delete everywhere: local + remote + manifest entry + file_state row. */
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

  if (removeEntry(ctx.manifest, relativePath)) {
    await saveManifest(backend, ctx.manifest);
  }
  await deleteFileState(ctx.library, relativePath);
}

/** Upload a local file into the backend + refresh manifest entry. */
export async function pushFile(
  backend: RemoteFileOps,
  manifest: Manifest,
  libraryCacheDirUri: string,
  relativePath: string,
  options: PushFileOptions = {},
): Promise<{ blake3: string; size: number; mtimeMs: number }> {
  assertSafeRelative(relativePath);
  const localFile = uriToFile(localFileUriFor(libraryCacheDirUri, relativePath));
  if (!localFile.exists) {
    throw new DataIntegrityError(i18n.t("sync.localFileMissing", { path: relativePath }));
  }
  if (backend.kind !== "local-direct") {
    if (isTransferBackend(backend)) {
      await uploadWithBackgroundTask(
        backend,
        relativePath,
        localFile.uri,
        options.onProgress,
        options.upload,
      );
    } else {
      const bytes = await localFile.bytes();
      await backend.writeBytes(relativePath, bytes);
    }
  }

  const hex = await blake3HexFile(localFile);
  const existing = findEntry(manifest, relativePath);
  const entry = {
    path: relativePath,
    size: localFile.size ?? 0,
    blake3: hex,
    mtime: localFile.modificationTime ? localFile.modificationTime * 1000 : Date.now(),
    required: options.required ?? existing?.required ?? false,
    sourceOfTruth: (existing?.sourceOfTruth ?? "cloud") as "cloud" | "local",
  };
  manifest.entries = manifest.entries.filter((e) => e.path !== relativePath);
  manifest.entries.push(entry);
  await saveManifest(backend, manifest);

  return { blake3: hex, size: entry.size, mtimeMs: entry.mtime };
}