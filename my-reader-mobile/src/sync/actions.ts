import type { DataSource, Library } from "../data/types";
import { AppInvariantError } from "../errors";

import type { FileState as FileStateRow } from "@my-reader/db/types";
import {
  deleteFileState,
  listFileStates,
  upsertFileState,
} from "../data/file_state";
import { resolveLibraryBooksDir } from "./backend";
import { getOrCreateDeviceId } from "./device";
import {
  deleteEverywhere as fileOpsDeleteEverywhere,
  downloadFile as fileOpsDownload,
  downloadFileDirect as fileOpsDownloadDirect,
  downloadFileDirectWithProgress as fileOpsDownloadDirectWithProgress,
  evictLocal as fileOpsEvictLocal,
  type BackgroundDownloadOptions,
  type DownloadOutcome,
} from "./file_ops";
import {
  findEntry,
  loadManifest,
  saveManifest,
  type Manifest,
  type ManifestEntry,
} from "./manifest";
import { resolveSyncTarget, type ResolvedSyncTarget } from "./resolve";
import i18n from "@/src/i18n";

export type SyncTargetContext = ResolvedSyncTarget & {
  manifest: Manifest;
  deviceId: string;
  library: Library;
};

const RECONCILE_BATCH_SIZE = 100;

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Lift a library + datasources into a self-contained sync context that owns
 * its backend, manifest, and cache directory.
 */
export async function openSyncContext(
  library: Library,
  dataSources: DataSource[],
): Promise<SyncTargetContext> {
  console.info("Start to open sync context, params:", {
    libraryId: library.id,
    sourceType: library.sourceType ?? "local",
    dataSourceId: library.dataSourceId ?? null,
  });
  const deviceId = await getOrCreateDeviceId(library);
  const resolved = await resolveSyncTarget(library, dataSources);
  const manifest = await loadManifest(resolved.backend, deviceId);
  console.info("Success to open sync context:", {
    libraryId: resolved.libraryId,
    dataSourceId: resolved.dataSourceId,
    backendKind: resolved.backend.kind,
    manifestEntries: manifest.entries.length,
  });
  return { ...resolved, manifest, deviceId, library };
}

export type DownloadResult = {
  entry: ManifestEntry;
  outcome: DownloadOutcome;
};

/** Download + record `present` state so the UI button reflects reality. */
export async function downloadFile(
  ctx: SyncTargetContext,
  relativePath: string,
): Promise<DownloadResult> {
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

/**
 * Reconcile cached `file_state` rows against the freshly loaded manifest.
 * Upserts a `remote_only` row for every manifest entry not already tracked.
 */
export async function reconcileFileStates(
  ctx: SyncTargetContext,
): Promise<FileStateRow[]> {
  const existing = await listFileStates(ctx.library);
  const existingByPath = new Map(existing.map((row) => [row.path, row]));
  const inserts = ctx.manifest.entries
    .filter((entry) => !existingByPath.has(entry.path));

  for (let index = 0; index < inserts.length; index += RECONCILE_BATCH_SIZE) {
    const batch = inserts.slice(index, index + RECONCILE_BATCH_SIZE);
    for (const entry of batch) {
      await upsertFileState(ctx.library, entry.path, { localState: "remote_only" });
    }
    await yieldToEventLoop();
  }

  for (const row of existing) {
    const stillInManifest = findEntry(ctx.manifest, row.path);
    if (!stillInManifest && row.localState === "remote_only") {
      await deleteFileState(ctx.library, row.path);
    }
  }
  return await listFileStates(ctx.library);
}

export async function listBackedFiles(
  ctx: SyncTargetContext,
  filter?: string,
): Promise<FileStateRow[]> {
  const rows = await listFileStates(ctx.library);
  if (!filter) return rows;
  const needle = filter.toLowerCase();
  return rows.filter((row) => row.path.toLowerCase().includes(needle));
}

export function getLibraryCacheDirUri(libraryId: string): string {
  return resolveLibraryBooksDir(libraryId);
}

/** Persist an updated manifest after mutating entries in-place. */
export async function persistManifest(ctx: SyncTargetContext): Promise<void> {
  await saveManifest(ctx.backend, ctx.manifest);
}