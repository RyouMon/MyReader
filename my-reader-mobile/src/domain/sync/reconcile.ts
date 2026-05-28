import type { FileState as FileStateRow } from "@my-reader/db/types";

import {
  deleteFileState,
  listFileStates,
  upsertFileState,
} from "../../repos/file_state";
import { findEntry } from "./manifest";
import type { SyncTargetContext } from "./context";
import { yieldToEventLoop } from "../../utils/common";

const RECONCILE_BATCH_SIZE = 100;

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
