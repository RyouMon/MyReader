import { blake3 } from "@noble/hashes/blake3.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { Directory, File } from "expo-file-system";
import { deleteAsync, makeDirectoryAsync } from "expo-file-system/legacy";

import type { RemoteBackend } from "../../services/remote/backend";
import { isRemoteBackend } from "./resolve";
import { localFileUriFor, resolveLibraryBooksDir } from "../../services/fs/path";
import { AppInvariantError, DataIntegrityError } from "../../errors";
import type { Manifest, ManifestEntry } from "./manifest";
import { findEntry, removeEntry, saveManifest } from "./manifest";
import { clearExtractedReaderCachesForArchiveUri } from "../../services/fs/cache";
import {
  startNativeDownload,
  startNativeUpload,
  type NativeDownloadOptions,
  type NativeUploadOptions,
} from "../../services/download/native";
import { parentDirectoryUriForFileUri } from "../../services/fs/path";
import { upsertFileState, deleteFileState } from "../../repos/file_state";
import type { Library } from "../types";
import type { SyncTargetContext } from "./context";
import i18n from "@/src/i18n";
import { describeError, yieldToEventLoop } from "../../utils/common";

export type DownloadOutcome = {
  blake3: string | null;
  size: number;
  mtimeMs: number;
};

export type DownloadResult = {
  entry: ManifestEntry;
  outcome: DownloadOutcome;
};

type BackgroundDownloadOptions = NativeDownloadOptions;
type BackgroundUploadOptions = NativeUploadOptions;

type PushFileOptions = {
  required?: boolean;
  onProgress?: (sent: number, total: number) => void;
  upload?: BackgroundUploadOptions;
};

const HASH_CHUNK_BYTES = 1024 * 1024;

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

async function uploadWithBackgroundTask(
  backend: RemoteBackend,
  relativePath: string,
  sourceUri: string,
  onProgress?: (sent: number, total: number) => void,
  options: BackgroundUploadOptions = {},
): Promise<number> {
  const request = await backend.getUploadRequest(sourceUri, relativePath);

  if (backend.prepareUpload) {
    await backend.prepareUpload(sourceUri, relativePath);
  }

  return startNativeUpload({
    relativePath,
    url: backend.contentUrl(relativePath),
    sourceUri,
    method: "PUT",
    headers: request.headers,
    onProgress,
    options,
  }).then((result) => result.bytesUploaded);
}

// ─── Internal transfer ops (no file_state side effects) ─────────────────

async function downloadFileManifest(
  backend: RemoteBackend,
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
  await downloadWithBackgroundTask(backend, relativePath, destUri);
  const written = uriToFile(destUri);
  const hex = await blake3HexFile(written);
  if (hex !== entry.blake3) {
    await deleteFileIfExists(written);
    throw new DataIntegrityError(i18n.t("sync.hashMismatch", { expected: entry.blake3, actual: hex }));
  }

  return {
    blake3: hex,
    size: written.size ?? 0,
    mtimeMs: destFile.modificationTime ? destFile.modificationTime * 1000 : Date.now(),
  };
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

export async function downloadFile(
  ctx: SyncTargetContext,
  relativePath: string,
): Promise<DownloadResult> {
  if (!isRemoteBackend(ctx.backend)) {
    throw new AppInvariantError(i18n.t("sync.nativeDownloadNotSupported", { kind: ctx.backend.kind }));
  }
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
  return { entry, outcome };
}

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

  if (removeEntry(ctx.manifest, relativePath)) {
    await saveManifest(backend, ctx.manifest);
  }
  await deleteFileState(ctx.library, relativePath);
}

export async function pushFile(
  backend: RemoteBackend,
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
  if (backend.prepareUpload) {
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