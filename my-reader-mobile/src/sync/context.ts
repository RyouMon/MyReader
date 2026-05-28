import type { DataSource, Library } from "../data/types";

import { resolveLibraryBooksDir } from "../services/fs/path";
import { getOrCreateDeviceId } from "./device";
import { loadManifest, type Manifest } from "./manifest";
import { resolveSyncTarget, type ResolvedSyncTarget } from "./resolve";

export type SyncTargetContext = ResolvedSyncTarget & {
  manifest: Manifest;
  deviceId: string;
  library: Library;
};

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

export function getLibraryCacheDirUri(libraryId: string): string {
  return resolveLibraryBooksDir(libraryId);
}