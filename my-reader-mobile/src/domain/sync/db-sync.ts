import {
  getReadingProgressUpdatedAt,
  listReadingProgressSince,
  upsertReadingProgress,
} from "../../repos/reading_progress";
import { getSyncMeta, setSyncMeta } from "../../repos/sync_meta";
import { withSecurityScopedLibraryAccess } from "../../services/fs/bookmarks";
import type { Library } from "../types";
import { getOrCreateDeviceId } from "./device";
import { LocalDirectBackend } from "./local";
import { isLocalDirect, type ResolvedSyncTarget, type SyncBackend } from "./resolve";

type ChangeRow = {
  t: string;
  k: Record<string, unknown>;
  v: Record<string, unknown>;
};

function lastPushCursorKey(deviceId: string): string {
  return `last_push_cursor::${deviceId}`;
}

function lastPullCursorKey(deviceId: string, remoteDevice: string): string {
  return `last_pull_cursor::${deviceId}::${remoteDevice}`;
}

async function pushDbChanges(
  backend: SyncBackend,
  library: Library,
  deviceId: string,
): Promise<number> {
  const cursorKey = lastPushCursorKey(deviceId);
  const cursorStr = await getSyncMeta(library, cursorKey);
  const sinceMs = cursorStr ? parseFloat(cursorStr) : 0;

  const rows = await listReadingProgressSince(library, sinceMs);

  if (rows.length === 0) return 0;

  let maxTs = sinceMs;
  const lines: string[] = [];
  for (const row of rows) {
    if (row.updatedAt > maxTs) maxTs = row.updatedAt;
    const change: ChangeRow = {
      t: "reading_progress",
      k: { book_id: row.bookId, format: row.format },
      v: { locator_json: row.locatorJson, updated_at: row.updatedAt },
    };
    lines.push(JSON.stringify(change));
  }

  const payload = `${lines.join("\n")}\n`;
  const seq = Date.now();
  const objectPath = `.myreader/changes/${deviceId}/${seq}.jsonl`;

  await backend.writeBytes(objectPath, new TextEncoder().encode(payload));
  await setSyncMeta(library, cursorKey, String(maxTs));

  return rows.length;
}

async function pullDbChanges(
  backend: SyncBackend,
  library: Library,
  deviceId: string,
): Promise<number> {
  const deviceDirs = await backend.listRemote(".myreader/changes/");
  if (deviceDirs.length === 0) return 0;

  let applied = 0;

  for (const dir of deviceDirs) {
    const remoteDevice = dir.replace(/\/$/, "");
    if (!remoteDevice || remoteDevice === deviceId) continue;

    let files: string[];
    try {
      files = await backend.listRemote(`.myreader/changes/${remoteDevice}/`);
    } catch (err) {
      console.warn(`[db-sync] pull: cannot list .myreader/changes/${remoteDevice}/:`, err);
      continue;
    }

    const pullKey = lastPullCursorKey(deviceId, remoteDevice);
    const lastSeqStr = await getSyncMeta(library, pullKey);
    const lastSeq = lastSeqStr ? parseInt(lastSeqStr, 10) : 0;

    const sortedFiles = files
      .filter((f) => f.endsWith(".jsonl"))
      .map((f) => ({ name: f, seq: parseInt(f.replace(/\.jsonl$/, ""), 10) }))
      .filter((f) => f.seq > 0 && f.seq > lastSeq)
      .sort((a, b) => a.seq - b.seq);

    for (const { name: fileName, seq } of sortedFiles) {
      const filePath = `.myreader/changes/${remoteDevice}/${fileName}`;
      const bytes = await backend.readBytes(filePath);
      const text = new TextDecoder().decode(bytes);

      for (const line of text.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        let change: ChangeRow;
        try {
          change = JSON.parse(trimmed) as ChangeRow;
        } catch {
          console.warn(`[db-sync] pull: malformed line in ${filePath}`);
          continue;
        }
        if (change.t !== "reading_progress") continue;

        const incomingTs =
          typeof change.v.updated_at === "number" ? change.v.updated_at : 0;
        const bookId = Number(change.k.book_id ?? 0);
        const format = String(change.k.format ?? "");
        const locatorJson = String(change.v.locator_json ?? "");

        if (!bookId || !format || !locatorJson || incomingTs <= 0) continue;

        const existingTs = await getReadingProgressUpdatedAt(library, bookId, format);
        const baselineTs = existingTs ?? -1;

        if (incomingTs <= baselineTs) continue;

        await upsertReadingProgress(library, {
          bookId,
          format,
          locatorJson,
          updatedAt: incomingTs,
        });
        applied++;
      }

      await setSyncMeta(library, pullKey, String(seq));
    }
  }

  return applied;
}

export type DbSyncReport = {
  pushed: number;
  pulled: number;
};

export async function syncDbFromContext(
  library: Library,
  ctx: ResolvedSyncTarget,
): Promise<DbSyncReport> {
  if (isLocalDirect(ctx.backend)) {
    if (!library.securityScopedBookmark) {
      return { pushed: 0, pulled: 0 };
    }
    const deviceId = await getOrCreateDeviceId(library);

    const { result } = await withSecurityScopedLibraryAccess(library, async (resolvedUri) => {
      const backend = new LocalDirectBackend(resolvedUri);
      const pushed = await pushDbChanges(backend, library, deviceId);
      const pulled = await pullDbChanges(backend, library, deviceId);
      return { pushed, pulled };
    });

    return result;
  }

  const deviceId = await getOrCreateDeviceId(library);
  const pushed = await pushDbChanges(ctx.backend, library, deviceId);
  const pulled = await pullDbChanges(ctx.backend, library, deviceId);

  return { pushed, pulled };
}
