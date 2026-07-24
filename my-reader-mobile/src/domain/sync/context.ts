import type { DataSource, Library } from "../types"

import { resolveSyncTarget, type ResolvedSyncTarget } from "./resolve"

export type SyncTargetContext = ResolvedSyncTarget & {
  library: Library
}

/**
 * Lift a library + datasources into a self-contained sync context that owns
 * its backend and cache directory.
 */
export async function openSyncContext(
  library: Library,
  dataSources: DataSource[],
): Promise<SyncTargetContext> {
  const resolved = await resolveSyncTarget(library, dataSources)
  return { ...resolved, library }
}
