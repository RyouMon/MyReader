import type { DataSource, MobileLibrary } from "../data/types";

import { resolveLibraryBooksDir } from "./backend";
import { getOrCreateDeviceId } from "./device";
import {
  deleteFileState,
  type FileStateRow,
  listFileStates,
  upsertFileState,
  upsertFileStates,
} from "./file_state";
import {
  deleteEverywhere as fileOpsDeleteEverywhere,
  downloadFile as fileOpsDownload,
  downloadFileDirect as fileOpsDownloadDirect,
  type BackgroundDownloadOptions,
  type DownloadOutcome,
  downloadFileDirectWithProgress as fileOpsDownloadDirectWithProgress,
  evictLocal as fileOpsEvictLocal,
} from "./file_ops";
import {
  findEntry,
  type Manifest,
  type ManifestEntry,
  loadManifest,
  saveManifest,
} from "./manifest";
import { resolveSyncTarget, type ResolvedSyncTarget } from "./resolve";

export type SyncTargetContext = ResolvedSyncTarget & {
  manifest: Manifest;
  deviceId: string;
};

const RECONCILE_BATCH_SIZE = 100;

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Lift a library + datasources into a self-contained sync context that owns
 * its backend, manifest, and cache directory. Cheap-enough to call per action;
 * callers that need batch work can pass the returned context to every step.
 */
export async function openSyncContext(
  library: MobileLibrary,
  dataSources: DataSource[],
): Promise<SyncTargetContext> {
  console.info("Start to open sync context, params:", {
    libraryId: library.id,
    sourceType: library.sourceType ?? "local",
    dataSourceId: library.dataSourceId ?? null,
  });
  const deviceId = await getOrCreateDeviceId();
  const resolved = await resolveSyncTarget(library, dataSources);
  const manifest = await loadManifest(resolved.backend, deviceId);
  console.info("Success to open sync context:", {
    libraryId: resolved.libraryId,
    dataSourceId: resolved.dataSourceId,
    backendKind: resolved.backend.kind,
    manifestEntries: manifest.entries.length,
  });
  return { ...resolved, manifest, deviceId };
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
    throw new Error(`manifest 中未登记该路径: ${relativePath}`);
  }
  const outcome = await fileOpsDownload(
    ctx.backend,
    ctx.manifest,
    ctx.libraryCacheDirUri,
    relativePath,
  );
  console.info("Start to save file state after manifest-backed download, params:", {
    libraryId: ctx.libraryId,
    dataSourceId: ctx.dataSourceId,
    relativePath,
    localState: "present",
    size: outcome.size,
  });
  await upsertFileState(
    { dataSourceId: ctx.dataSourceId, libraryId: ctx.libraryId },
    relativePath,
    {
      localState: "present",
      localBlake3: outcome.blake3,
      localSize: outcome.size,
      localMtime: outcome.mtimeMs,
    },
  );
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
 * entry. Intended for first-time downloads from book detail before reconcile.
 */
export async function downloadFileDirect(
  ctx: SyncTargetContext,
  relativePath: string,
): Promise<void> {
  console.info("Start to download file directly, params:", {
    libraryId: ctx.libraryId,
    dataSourceId: ctx.dataSourceId,
    relativePath,
  });
  const outcome = await fileOpsDownloadDirect(ctx.backend, ctx.libraryCacheDirUri, relativePath);
  console.info("Start to save file state after direct download, params:", {
    libraryId: ctx.libraryId,
    dataSourceId: ctx.dataSourceId,
    relativePath,
    localState: "present",
    size: outcome.size,
  });
  await upsertFileState(
    { dataSourceId: ctx.dataSourceId, libraryId: ctx.libraryId },
    relativePath,
    {
      localState: "present",
      localBlake3: outcome.blake3,
      localSize: outcome.size,
      localMtime: outcome.mtimeMs,
    },
  );
  console.info("Success to download file directly:", {
    libraryId: ctx.libraryId,
    relativePath,
    size: outcome.size,
    blake3: outcome.blake3,
  });
}

export async function downloadFileDirectWithProgress(
  ctx: SyncTargetContext,
  relativePath: string,
  onProgress?: (received: number, total: number) => void,
  options: BackgroundDownloadOptions = {},
): Promise<void> {
  console.info("Start to download file directly with progress, params:", {
    libraryId: ctx.libraryId,
    dataSourceId: ctx.dataSourceId,
    relativePath,
  });
  const outcome = await fileOpsDownloadDirectWithProgress(
    ctx.backend,
    ctx.libraryCacheDirUri,
    relativePath,
    onProgress,
    options,
  );
  console.info("Start to save file state after progress download, params:", {
    libraryId: ctx.libraryId,
    dataSourceId: ctx.dataSourceId,
    relativePath,
    localState: "present",
    size: outcome.size,
  });
  await upsertFileState(
    { dataSourceId: ctx.dataSourceId, libraryId: ctx.libraryId },
    relativePath,
    {
      localState: "present",
      localBlake3: outcome.blake3,
      localSize: outcome.size,
      localMtime: outcome.mtimeMs,
    },
  );
  console.info("Success to download file directly with progress:", {
    libraryId: ctx.libraryId,
    relativePath,
    size: outcome.size,
    blake3: outcome.blake3,
  });
}

/** Flip a path back to `remote_only` (local file removed, manifest preserved). */
export async function evictLocalFile(
  ctx: SyncTargetContext,
  relativePath: string,
): Promise<void> {
  console.info("Start to remove local cached file, params:", {
    libraryId: ctx.libraryId,
    dataSourceId: ctx.dataSourceId,
    relativePath,
  });
  await fileOpsEvictLocal(ctx.libraryCacheDirUri, relativePath);
  await upsertFileState(
    { dataSourceId: ctx.dataSourceId, libraryId: ctx.libraryId },
    relativePath,
    { localState: "remote_only", localBlake3: null, localSize: null, localMtime: null },
  );
  console.info("Success to remove local cached file:", {
    libraryId: ctx.libraryId,
    relativePath,
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
  await deleteFileState(
    { dataSourceId: ctx.dataSourceId, libraryId: ctx.libraryId },
    relativePath,
  );
}

/**
 * Reconcile cached `file_state` rows against the freshly loaded manifest so
 * the UI never shows stale `present` badges after a remote delete elsewhere.
 *
 * Upserts a `remote_only` row for every manifest entry not already tracked —
 * that's what backs the download button list.
 */
export async function reconcileFileStates(
  ctx: SyncTargetContext,
): Promise<FileStateRow[]> {
  const scope = { dataSourceId: ctx.dataSourceId, libraryId: ctx.libraryId };
  const existing = await listFileStates(scope);
  const existingByPath = new Map(existing.map((row) => [row.path, row]));
  const inserts = ctx.manifest.entries
    .filter((entry) => !existingByPath.has(entry.path))
    .map((entry) => ({
      path: entry.path,
      patch: { localState: "remote_only" as const },
    }));

  for (let index = 0; index < inserts.length; index += RECONCILE_BATCH_SIZE) {
    await upsertFileStates(scope, inserts.slice(index, index + RECONCILE_BATCH_SIZE));
    await yieldToEventLoop();
  }

  for (const row of existing) {
    const stillInManifest = findEntry(ctx.manifest, row.path);
    if (!stillInManifest && row.localState === "remote_only") {
      await deleteFileState(scope, row.path);
    }
  }
  return await listFileStates(scope);
}

export async function listBackedFiles(
  ctx: SyncTargetContext,
  filter?: string,
): Promise<FileStateRow[]> {
  const rows = await listFileStates({
    dataSourceId: ctx.dataSourceId,
    libraryId: ctx.libraryId,
  });
  if (!filter) return rows;
  const needle = filter.toLowerCase();
  return rows.filter((row) => row.path.toLowerCase().includes(needle));
}

/**
 * Cheap helper for UI tiles that only have a library id — wires up the cache
 * directory without touching network state.
 */
export function getLibraryCacheDirUri(libraryId: string): string {
  return resolveLibraryBooksDir(libraryId);
}

/** Persist an updated manifest after mutating entries in-place. */
export async function persistManifest(ctx: SyncTargetContext): Promise<void> {
  await saveManifest(ctx.backend, ctx.manifest);
}
