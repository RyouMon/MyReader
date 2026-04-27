import { blake3 } from "@noble/hashes/blake3.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { Directory, File } from "expo-file-system";

import type { SyncBackend } from "./backend";
import { localFileUriFor } from "./backend";
import type { Manifest } from "./manifest";
import { findEntry, removeEntry, saveManifest } from "./manifest";

export type DownloadOutcome = {
  blake3: string;
  size: number;
  mtimeMs: number;
};

function blake3Hex(bytes: Uint8Array): string {
  return bytesToHex(blake3(bytes));
}

function assertSafeRelative(relativePath: string): void {
  if (!relativePath) {
    throw new Error("同步路径不能为空");
  }
  if (relativePath.includes("..")) {
    throw new Error(`同步路径不能包含 ..: ${relativePath}`);
  }
  if (relativePath.startsWith("/")) {
    throw new Error(`同步路径不能是绝对路径: ${relativePath}`);
  }
}

function uriToFile(uri: string): File {
  return new File(uri);
}

function ensureParentDirFor(uri: string): void {
  const withoutScheme = uri.replace(/^file:\/\//, "");
  const lastSlash = withoutScheme.lastIndexOf("/");
  if (lastSlash <= 0) return;
  const parentPath = `file://${withoutScheme.slice(0, lastSlash)}`;
  const parent = new Directory(parentPath);
  if (!parent.exists) {
    parent.create({ idempotent: true, intermediates: true });
  }
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
    throw new Error(`manifest 中未登记该路径: ${relativePath}`);
  }

  const destUri = localFileUriFor(libraryCacheDirUri, relativePath);
  const destFile = uriToFile(destUri);
  if (destFile.exists) {
    const existing = await destFile.bytes();
    const hex = blake3Hex(existing);
    if (hex === entry.blake3) {
      return {
        blake3: hex,
        size: existing.byteLength,
        mtimeMs: destFile.modificationTime ? destFile.modificationTime * 1000 : Date.now(),
      };
    }
    destFile.delete();
  }

  ensureParentDirFor(destUri);
  const bytes = await backend.readBytes(relativePath);
  const hex = blake3Hex(bytes);
  if (hex !== entry.blake3) {
    throw new Error(`下载后哈希不匹配: 期望 ${entry.blake3}，实际 ${hex}`);
  }
  destFile.create({ intermediates: true, overwrite: true });
  destFile.write(bytes);

  return {
    blake3: hex,
    size: bytes.byteLength,
    mtimeMs: destFile.modificationTime ? destFile.modificationTime * 1000 : Date.now(),
  };
}

/**
 * Download the remote file directly into the library cache dir without
 * requiring a manifest entry. Computes blake3 from the downloaded bytes.
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

  if (destFile.exists) {
    const existing = await destFile.bytes();
    const hex = blake3Hex(existing);
    return {
      blake3: hex,
      size: existing.byteLength,
      mtimeMs: destFile.modificationTime ? destFile.modificationTime * 1000 : Date.now(),
    };
  }

  ensureParentDirFor(destUri);
  const bytes = await backend.readBytes(relativePath);
  const hex = blake3Hex(bytes);
  destFile.create({ intermediates: true, overwrite: true });
  destFile.write(bytes);

  return {
    blake3: hex,
    size: bytes.byteLength,
    mtimeMs: destFile.modificationTime ? destFile.modificationTime * 1000 : Date.now(),
  };
}

export function evictLocal(libraryCacheDirUri: string, relativePath: string): void {
  assertSafeRelative(relativePath);
  const file = uriToFile(localFileUriFor(libraryCacheDirUri, relativePath));
  if (file.exists) {
    file.delete();
  }
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
  if (localFile.exists) {
    localFile.delete();
  }

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
  options: { required?: boolean } = {},
): Promise<{ blake3: string; size: number; mtimeMs: number }> {
  assertSafeRelative(relativePath);
  const localFile = uriToFile(localFileUriFor(libraryCacheDirUri, relativePath));
  if (!localFile.exists) {
    throw new Error(`本地文件不存在，无法上传: ${relativePath}`);
  }
  const bytes = await localFile.bytes();
  const hex = blake3Hex(bytes);

  if (!backend.isLocalDirect) {
    await backend.writeBytes(relativePath, bytes);
  }

  const existing = findEntry(manifest, relativePath);
  const entry = {
    path: relativePath,
    size: bytes.byteLength,
    blake3: hex,
    mtime: localFile.modificationTime ? localFile.modificationTime * 1000 : Date.now(),
    required: options.required ?? existing?.required ?? false,
    sourceOfTruth: (existing?.sourceOfTruth ?? "cloud") as "cloud" | "local",
  };
  manifest.entries = manifest.entries.filter((e) => e.path !== relativePath);
  manifest.entries.push(entry);
  await saveManifest(backend, manifest);

  return { blake3: hex, size: bytes.byteLength, mtimeMs: entry.mtime };
}
