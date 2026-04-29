import { blake3 } from "@noble/hashes/blake3.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { Directory, File } from "expo-file-system";
import { deleteAsync, makeDirectoryAsync } from "expo-file-system/legacy";

import type { SyncBackend } from "./backend";
import { localFileUriFor } from "./backend";
import { AppInvariantError, DataIntegrityError } from "../errors";
import type { Manifest } from "./manifest";
import { findEntry, removeEntry, saveManifest } from "./manifest";
import { clearExtractedReaderCachesForArchiveUri } from "../data/cache";
import {
  startNativeDownload,
  startNativeUpload,
  type NativeDownloadOptions,
  type NativeUploadOptions,
} from "./native-download";
import { parentDirectoryUriForFileUri } from "../utils/io";

export type DownloadOutcome = {
  blake3: string | null;
  size: number;
  mtimeMs: number;
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
    throw new AppInvariantError("同步路径不能为空");
  }
  if (relativePath.includes("..")) {
    throw new AppInvariantError(`同步路径不能包含 ..: ${relativePath}`);
  }
  if (relativePath.startsWith("/")) {
    throw new AppInvariantError(`同步路径不能是绝对路径: ${relativePath}`);
  }
}

function uriToFile(uri: string): File {
  return new File(uri);
}

/**
 * Returns local metadata without reading the whole file into JS memory.
 */
function outcomeFromFileWithoutHash(file: File): DownloadOutcome {
  return {
    blake3: null,
    size: file.size ?? 0,
    mtimeMs: file.modificationTime ? file.modificationTime * 1000 : Date.now(),
  };
}

/**
 * Returns whether a cached direct-download target is usable without hitting the network.
 */
function hasNonEmptyFileBytes(file: File): boolean {
  return file.exists && (file.size ?? 0) > 0;
}

/**
 * Reads metadata after native downloader has already materialized the file.
 */
function outcomeFromNativeDownload(file: File, bytesDownloaded: number, relativePath: string): DownloadOutcome {
  if (!file.exists) {
    throw new DataIntegrityError(`原生下载已完成，但缓存文件不存在: ${relativePath}`);
  }
  const size = file.size ?? 0;
  if (size <= 0) {
    throw new DataIntegrityError(`原生下载已完成，但缓存文件为空: ${relativePath}`);
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
  backend: SyncBackend,
  relativePath: string,
  destUri: string,
  onProgress?: (received: number, total: number) => void,
  options: BackgroundDownloadOptions = {},
): Promise<number> {
  const request = backend.getDownloadRequest(relativePath);
  if (!request) {
    throw new AppInvariantError(`当前后端不支持原生后台下载: ${backend.kind}`);
  }

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
  backend: SyncBackend,
  relativePath: string,
  sourceUri: string,
  onProgress?: (sent: number, total: number) => void,
  options: BackgroundUploadOptions = {},
): Promise<number> {
  const request = backend.getUploadRequest(relativePath);
  if (!request) {
    throw new AppInvariantError(`当前后端不支持原生后台上传: ${backend.kind}`);
  }

  await backend.prepareUpload?.(relativePath);
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

/**
 * Download the remote file listed in `manifest` into the library cache dir.
 *
 * If the local bytes already match the manifest blake3 we skip the fetch.
 */
export async function downloadFile(
  backend: SyncBackend,
  manifest: Manifest,
  libraryCacheDirUri: string,
  relativePath: string,
): Promise<DownloadOutcome> {
  assertSafeRelative(relativePath);
  const entry = findEntry(manifest, relativePath);
  if (!entry) {
    throw new AppInvariantError(`manifest 中未登记该路径: ${relativePath}`);
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
    throw new DataIntegrityError(`下载后哈希不匹配: 期望 ${entry.blake3}，实际 ${hex}`);
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

/**
 * Download the remote file directly into the library cache dir without
 * requiring a manifest entry.
 *
 * Use this when the manifest may not yet contain the path (e.g. first-time
 * download from the book-detail screen before any reconcile has run).
 */
export async function downloadFileDirect(
  backend: SyncBackend,
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

  return downloadFileDirectWithProgress(backend, libraryCacheDirUri, relativePath);
}

export async function downloadFileDirectWithProgress(
  backend: SyncBackend,
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

export async function evictLocal(libraryCacheDirUri: string, relativePath: string): Promise<void> {
  assertSafeRelative(relativePath);
  const file = uriToFile(localFileUriFor(libraryCacheDirUri, relativePath));
  await deleteFileIfExists(file);
  await clearExtractedReaderCachesForArchiveUri(file.uri);
}

/**
 * Full delete: local cache + remote bytes + manifest entry.
 *
 * Mirrors desktop's `delete_everywhere` contract: callers are responsible for
 * clearing `file_state` for the affected path.
 */
export async function deleteEverywhere(
  backend: SyncBackend,
  manifest: Manifest,
  libraryCacheDirUri: string,
  relativePath: string,
): Promise<void> {
  assertSafeRelative(relativePath);

  const localFile = uriToFile(localFileUriFor(libraryCacheDirUri, relativePath));
  await deleteFileIfExists(localFile);
  await clearExtractedReaderCachesForArchiveUri(localFile.uri);

  await backend.deleteRemote(relativePath);

  if (removeEntry(manifest, relativePath)) {
    await saveManifest(backend, manifest);
  }
}

/**
 * Upload a local file into the backend + refresh manifest entry.
 *
 * Skips the network round-trip for LocalDirect backends since "remote" IS the
 * local library directory in that mode.
 */
export async function pushFile(
  backend: SyncBackend,
  manifest: Manifest,
  libraryCacheDirUri: string,
  relativePath: string,
  options: PushFileOptions = {},
): Promise<{ blake3: string; size: number; mtimeMs: number }> {
  assertSafeRelative(relativePath);
  const localFile = uriToFile(localFileUriFor(libraryCacheDirUri, relativePath));
  if (!localFile.exists) {
    throw new DataIntegrityError(`本地文件不存在，无法上传: ${relativePath}`);
  }
  if (!backend.isLocalDirect) {
    const uploadRequest = backend.getUploadRequest(relativePath);
    if (uploadRequest) {
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
