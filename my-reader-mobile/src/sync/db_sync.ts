/**
 * Database sync: LWW (Last-Writer-Wins by updated_at) push/pull for
 * reading_progress.
 *
 * Change files live at `.myreader/changes/{device}/{seq}.jsonl` on the backend.
 * Per-line format: {"t":"reading_progress","k":{...},"v":{...}}
 *
 * Mirrors the desktop LwwProvider in my-reader/src-tauri/src/sync/db_sync.rs.
 * Both sides use millisecond timestamps for updated_at.
 */

import type { DB } from "@op-engineering/op-sqlite";

import type { DataSource, Library } from "../data/types";
import { getLibraryDatabase } from "../data/library-db";
import { withSecurityScopedLibraryAccess } from "../data/security-scoped-bookmarks";
import { getOrCreateDeviceId } from "./device";
import { getSyncMeta, setSyncMeta } from "./sync_meta";
import { resolveSyncTarget, type ResolvedSyncTarget } from "./resolve";
import { buildBackend, type SyncBackend } from "./backend";

const LOG_TARGET = "db-sync";

type ChangeRow = {
  t: string;
  k: Record<string, unknown>;
  v: Record<string, unknown>;
};

function dbSyncScope(dataSourceId: string, libraryId: string): string {
  return `db_sync::${dataSourceId}::${libraryId}`;
}

function lastPushCursorKey(deviceId: string): string {
  return `last_push_cursor::${deviceId}`;
}

function lastPullCursorKey(deviceId: string, remoteDevice: string): string {
  return `last_pull_cursor::${deviceId}::${remoteDevice}`;
}

async function pushDbChanges(
  db: DB,
  backend: SyncBackend,
  deviceId: string,
  scope: string,
): Promise<number> {
  const cursorKey = lastPushCursorKey(deviceId);
  const cursorStr = await getSyncMeta(scope, cursorKey);
  const sinceMs = cursorStr ? parseFloat(cursorStr) : 0;

  const result = await db.execute(
    `SELECT book_id, format, locator_json, updated_at
     FROM reading_progress
     WHERE updated_at > ?
     ORDER BY updated_at`,
    [sinceMs],
  );

  const rows = result.rows as Array<{
    book_id: number;
    format: string;
    locator_json: string;
    updated_at: number;
  }>;

  if (rows.length === 0) return 0;

  let maxTs = sinceMs;
  const lines: string[] = [];
  for (const row of rows) {
    if (row.updated_at > maxTs) maxTs = row.updated_at;
    const change: ChangeRow = {
      t: "reading_progress",
      k: { book_id: row.book_id, format: row.format },
      v: { locator_json: row.locator_json, updated_at: row.updated_at },
    };
    lines.push(JSON.stringify(change));
  }

  const payload = `${lines.join("\n")}\n`;
  const seq = Date.now();
  const objectPath = `.myreader/changes/${deviceId}/${seq}.jsonl`;

  console.info(`[${LOG_TARGET}] push: ${rows.length} rows → ${objectPath}`);
  await backend.writeBytes(objectPath, new TextEncoder().encode(payload));
  await setSyncMeta(scope, cursorKey, String(maxTs));

  return rows.length;
}

async function pullDbChanges(
  db: DB,
  backend: SyncBackend,
  deviceId: string,
  scope: string,
): Promise<number> {
  const deviceDirs = await backend.listRemote(".myreader/changes/");
  // listRemote returns [] when .myreader/changes/ doesn't exist yet.
  if (deviceDirs.length === 0) return 0;

  let applied = 0;

  for (const dir of deviceDirs) {
    const remoteDevice = dir.replace(/\/$/, "");
    if (!remoteDevice || remoteDevice === deviceId) continue;

    let files: string[];
    try {
      files = await backend.listRemote(`.myreader/changes/${remoteDevice}/`);
    } catch (err) {
      console.warn(`[${LOG_TARGET}] pull: cannot list .myreader/changes/${remoteDevice}/:`, err);
      continue;
    }

    const pullKey = lastPullCursorKey(deviceId, remoteDevice);
    const lastSeqStr = await getSyncMeta(scope, pullKey);
    const lastSeq = lastSeqStr ? parseInt(lastSeqStr, 10) : 0;

    // Sort by seq ascending so we process files in order.
    const sortedFiles = files
      .filter((f) => f.endsWith(".jsonl"))
      .map((f) => ({ name: f, seq: parseInt(f.replace(/\.jsonl$/, ""), 10) }))
      .filter((f) => f.seq > 0 && f.seq > lastSeq)
      .sort((a, b) => a.seq - b.seq);

    for (const { name: fileName, seq } of sortedFiles) {
      const filePath = `.myreader/changes/${remoteDevice}/${fileName}`;
      console.info(`[${LOG_TARGET}] pull: reading ${filePath}`);

      const bytes = await backend.readBytes(filePath);
      const text = new TextDecoder().decode(bytes);

      for (const line of text.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        let change: ChangeRow;
        try {
          change = JSON.parse(trimmed) as ChangeRow;
        } catch {
          console.warn(`[${LOG_TARGET}] pull: malformed line in ${filePath}`);
          continue;
        }
        if (change.t !== "reading_progress") continue;

        const incomingTs =
          typeof change.v.updated_at === "number" ? change.v.updated_at : 0;
        const bookId = Number(change.k.book_id ?? 0);
        const format = String(change.k.format ?? "");
        const locatorJson = String(change.v.locator_json ?? "");

        if (!bookId || !format || !locatorJson || incomingTs <= 0) continue;

        // LWW: only apply if incoming timestamp is newer.
        const existingResult = await db.execute(
          `SELECT updated_at FROM reading_progress
           WHERE book_id = ? AND format = ?`,
          [bookId, format],
        );
        const existingTs =
          existingResult.rows[0]
            ? Number((existingResult.rows[0] as { updated_at: number }).updated_at)
            : -1;

        if (incomingTs <= existingTs) continue;

        await db.execute(
          `INSERT OR REPLACE INTO reading_progress
           (book_id, format, locator_json, updated_at)
           VALUES (?, ?, ?, ?)`,
          [bookId, format, locatorJson, incomingTs],
        );
        applied++;
      }

      await setSyncMeta(scope, pullKey, String(seq));
    }
  }

  console.info(`[${LOG_TARGET}] pull: applied ${applied} rows`);
  return applied;
}

export type DbSyncReport = {
  pushed: number;
  pulled: number;
};

/**
 * Run a full DB sync cycle (push → pull) using an already-resolved sync
 * target.
 *
 * Local-direct + iOS security-scoped bookmark (iCloud): wraps the sync
 * inside `withSecurityScopedLibraryAccess` so expo-file-system can write
 * change files to the iCloud library directory. The DB itself (myreader.db)
 * stays in app docs and is always writable by op-sqlite.
 *
 * Local-direct without a security-scoped bookmark (Android): skipped —
 * no cross-device sync available.
 */
export async function syncDbFromContext(
  library: Library,
  ctx: ResolvedSyncTarget,
): Promise<DbSyncReport> {
  if (ctx.isLocalDirect) {
    if (!library.securityScopedBookmark) {
      return { pushed: 0, pulled: 0 };
    }
    const deviceId = await getOrCreateDeviceId();
    const db = getLibraryDatabase(library);
    const scope = dbSyncScope(ctx.dataSourceId, ctx.libraryId);

    const { result } = await withSecurityScopedLibraryAccess(library, async (resolvedUri) => {
      const backend = buildBackend({ kind: "local-direct", libraryRootUri: resolvedUri });
      const pushed = await pushDbChanges(db, backend, deviceId, scope);
      const pulled = await pullDbChanges(db, backend, deviceId, scope);
      return { pushed, pulled };
    });

    console.info(`[${LOG_TARGET}] local-direct sync done: pushed=${result.pushed}, pulled=${result.pulled}`);
    return result;
  }

  const deviceId = await getOrCreateDeviceId();
  const db = getLibraryDatabase(library);
  const scope = dbSyncScope(ctx.dataSourceId, ctx.libraryId);

  const pushed = await pushDbChanges(db, ctx.backend, deviceId, scope);
  const pulled = await pullDbChanges(db, ctx.backend, deviceId, scope);

  console.info(`[${LOG_TARGET}] sync done: pushed=${pushed}, pulled=${pulled}`);
  return { pushed, pulled };
}

/**
 * Convenience wrapper that resolves the sync target itself. Prefer
 * `syncDbFromContext` inside loops where the target is already resolved.
 */
export async function syncDbNow(
  library: Library,
  dataSources: DataSource[],
): Promise<DbSyncReport> {
  const ctx = await resolveSyncTarget(library, dataSources);
  return syncDbFromContext(library, ctx);
}
