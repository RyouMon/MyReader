import type { DataSource, MobileLibrary } from "../data/types";

import { resolveLibraryCacheDir } from "./backend";
import { getOrCreateDeviceId } from "./device";
import {
  deleteFileState,
  type FileStateRow,
  listFileStates,
  upsertFileState,
} from "./file_state";
import {
  deleteEverywhere as fileOpsDeleteEverywhere,
  downloadFile as fileOpsDownload,
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

/**
 * Lift a library + datasources into a self-contained sync context that owns
 * its backend, manifest, and cache directory. Cheap-enough to call per action;
 * callers that need batch work can pass the returned context to every step.
 */
export async function openSyncContext(
  library: MobileLibrary,
  dataSources: DataSource[],
): Promise<SyncTargetContext> {
  const deviceId = await getOrCreateDeviceId();
  const resolved = await resolveSyncTarget(library, dataSources);
  const manifest = await loadManifest(resolved.backend, deviceId);
  return { ...resolved, manifest, deviceId };
}

export type DownloadResult = {
  entry: ManifestEntry;
  outcome: { blake3: string; size: number; mtimeMs: number };
};

/** Download + record `present` state so the UI button reflects reality. */
export async function downloadFile(
  ctx: SyncTargetContext,
  relativePath: string,
): Promise<DownloadResult> {
  const entry = findEntry(ctx.manifest, relativePath);
  if (!entry) {
    throw new Error(`manifest 中未登记该路径: ${relativePath}`);
  }
  const outcome = await fileOpsDownload(
    ctx.backend,
    ctx.manifest,
    ctx.libraryCacheDirUri,
    relativePath,
  );
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
  return { entry, outcome };
}

/** Flip a path back to `remote_only` (local file removed, manifest preserved). */
export async function evictLocalFile(
  ctx: SyncTargetContext,
  relativePath: string,
): Promise<void> {
  fileOpsEvictLocal(ctx.libraryCacheDirUri, relativePath);
  await upsertFileState(
    { dataSourceId: ctx.dataSourceId, libraryId: ctx.libraryId },
    relativePath,
    { localState: "remote_only", localBlake3: null, localSize: null, localMtime: null },
  );
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

  for (const entry of ctx.manifest.entries) {
    if (!existingByPath.has(entry.path)) {
      await upsertFileState(scope, entry.path, { localState: "remote_only" });
    }
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
  return resolveLibraryCacheDir(libraryId);
}

/** Persist an updated manifest after mutating entries in-place. */
export async function persistManifest(ctx: SyncTargetContext): Promise<void> {
  await saveManifest(ctx.backend, ctx.manifest);
}
