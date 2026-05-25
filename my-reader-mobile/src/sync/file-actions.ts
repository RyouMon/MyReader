import type { Library } from "../data/types";
import { AppInvariantError } from "../errors";

import { upsertFileState, deleteFileState } from "../data/file_state";
import { resolveLibraryBooksDir, isTransferBackend } from "./backend";
import {
  deleteEverywhere as fileOpsDeleteEverywhere,
  downloadFile as fileOpsDownload,
  downloadFileDirect as fileOpsDownloadDirect,
  downloadFileDirectWithProgress as fileOpsDownloadDirectWithProgress,
  evictLocal as fileOpsEvictLocal,
  type BackgroundDownloadOptions,
  type DownloadOutcome,
} from "./file_ops";
import { findEntry, type ManifestEntry } from "./manifest";
import type { SyncTargetContext } from "./context";
import i18n from "@/src/i18n";

export type DownloadResult = {
  entry: ManifestEntry;
  outcome: DownloadOutcome;
};

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
  const outcome = await fileOpsDownload(
    ctx.backend,
    ctx.manifest,
    ctx.libraryCacheDirUri,
    relativePath,
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

/**
 * Download a file directly into the sync cache without requiring a manifest
 * entry.
 */
export async function downloadFileDirect(
  ctx: SyncTargetContext,
  relativePath: string,
): Promise<void> {
  if (!isTransferBackend(ctx.backend)) {
    throw new AppInvariantError(i18n.t("sync.nativeDownloadNotSupported", { kind: ctx.backend.kind }));
  }
  const outcome = await fileOpsDownloadDirect(ctx.backend, ctx.libraryCacheDirUri, relativePath);
  await upsertFileState(ctx.library, relativePath, {
    localState: "present",
    localBlake3: outcome.blake3,
    localSize: outcome.size,
    localMtime: outcome.mtimeMs,
  });
}

export async function downloadFileDirectWithProgress(
  ctx: SyncTargetContext,
  relativePath: string,
  onProgress?: (received: number, total: number) => void,
  options: BackgroundDownloadOptions = {},
): Promise<void> {
  if (!isTransferBackend(ctx.backend)) {
    throw new AppInvariantError(i18n.t("sync.nativeDownloadNotSupported", { kind: ctx.backend.kind }));
  }
  const outcome = await fileOpsDownloadDirectWithProgress(
    ctx.backend,
    ctx.libraryCacheDirUri,
    relativePath,
    onProgress,
    options,
  );
  await upsertFileState(ctx.library, relativePath, {
    localState: "present",
    localBlake3: outcome.blake3,
    localSize: outcome.size,
    localMtime: outcome.mtimeMs,
  });
}

/** Flip a path back to `remote_only` (local file removed, manifest preserved). */
export async function evictLocalFile(
  ctx: SyncTargetContext,
  relativePath: string,
): Promise<void> {
  await fileOpsEvictLocal(ctx.libraryCacheDirUri, relativePath);
  await upsertFileState(ctx.library, relativePath, {
    localState: "remote_only",
    localBlake3: null,
    localSize: null,
    localMtime: null,
  });
}

/**
 * Offline-safe variant: evict local file without loading the manifest or
 * touching the backend.
 */
export async function evictLocalFileOfflineSafe(
  library: Library,
  relativePath: string,
): Promise<void> {
  const libraryCacheDirUri = resolveLibraryBooksDir(library.id);
  await fileOpsEvictLocal(libraryCacheDirUri, relativePath);
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
  await fileOpsDeleteEverywhere(
    ctx.backend,
    ctx.manifest,
    ctx.libraryCacheDirUri,
    relativePath,
  );
  await deleteFileState(ctx.library, relativePath);
}