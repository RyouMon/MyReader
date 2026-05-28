import type { DataSource, Library } from "../types";

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
  const deviceId = await getOrCreateDeviceId(library);
  const resolved = await resolveSyncTarget(library, dataSources);
  const manifest = await loadManifest(resolved.backend, deviceId);
  return { ...resolved, manifest, deviceId, library };
}