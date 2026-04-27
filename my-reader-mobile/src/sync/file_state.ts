import type { Scalar } from "@op-engineering/op-sqlite";
import { useSyncExternalStore } from "react";

import { getAppDatabase } from "../data/sqlite";

/**
 * 本地文件三态（与桌面端保持一致）：
 *
 * - `remote_only`：云端 manifest 有记录，本地尚未下载
 * - `present`：本地存在完整文件；有 blake3 时表示已完成校验
 * - `local_only`：本地独有（尚未推送或 LocalDirect 模式）
 * - `dirty_push`：本地已修改，等待上推
 */
export type LocalState = "remote_only" | "present" | "local_only" | "dirty_push";

export type FileStateScope = {
  dataSourceId: string;
  libraryId: string;
};

export type FileStateRow = {
  path: string;
  localState: LocalState;
  localBlake3: string | null;
  localSize: number | null;
  localMtime: number | null;
};

export type FileStatePatch = {
  localState: LocalState;
  localBlake3?: string | null;
  localSize?: number | null;
  localMtime?: number | null;
};

export type FileStateUpsert = {
  path: string;
  patch: FileStatePatch;
};

type Listener = () => void;

const listeners = new Set<Listener>();
let revision = 0;

/** Registers a React external-store listener for file_state mutations. */
function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Returns the current file_state mutation revision. */
function getRevisionSnapshot(): number {
  return revision;
}

/** Notifies mounted screens that cached file_state reads are stale. */
function emitFileStateChanged(): void {
  revision += 1;
  for (const listener of listeners) listener();
}

/**
 * Exposes a monotonic revision for screens that cache file_state rows.
 */
export function useFileStateRevision(): number {
  return useSyncExternalStore(subscribe, getRevisionSnapshot, () => 0);
}

function rowFromRaw(raw: Record<string, Scalar>): FileStateRow {
  return {
    path: String(raw.path),
    localState: String(raw.local_state) as LocalState,
    localBlake3: raw.local_blake3 == null ? null : String(raw.local_blake3),
    localSize: raw.local_size == null ? null : Number(raw.local_size),
    localMtime: raw.local_mtime == null ? null : Number(raw.local_mtime),
  };
}

export async function upsertFileState(
  scope: FileStateScope,
  path: string,
  patch: FileStatePatch,
): Promise<void> {
  const db = getAppDatabase();
  const now = Math.floor(Date.now() / 1000);
  await db.execute(
    `INSERT INTO file_state (
       data_source_id, library_id, path, local_state,
       local_blake3, local_size, local_mtime, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(data_source_id, library_id, path) DO UPDATE SET
       local_state  = excluded.local_state,
       local_blake3 = excluded.local_blake3,
       local_size   = excluded.local_size,
       local_mtime  = excluded.local_mtime,
       updated_at   = excluded.updated_at`,
    [
      scope.dataSourceId,
      scope.libraryId,
      path,
      patch.localState,
      patch.localBlake3 ?? null,
      patch.localSize ?? null,
      patch.localMtime ?? null,
      now,
    ],
  );
  emitFileStateChanged();
}

export async function upsertFileStates(
  scope: FileStateScope,
  entries: FileStateUpsert[],
): Promise<void> {
  if (entries.length === 0) return;
  const db = getAppDatabase();
  const now = Math.floor(Date.now() / 1000);
  await db.execute("BEGIN");
  try {
    for (const entry of entries) {
      await db.execute(
        `INSERT INTO file_state (
           data_source_id, library_id, path, local_state,
           local_blake3, local_size, local_mtime, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(data_source_id, library_id, path) DO UPDATE SET
           local_state  = excluded.local_state,
           local_blake3 = excluded.local_blake3,
           local_size   = excluded.local_size,
           local_mtime  = excluded.local_mtime,
           updated_at   = excluded.updated_at`,
        [
          scope.dataSourceId,
          scope.libraryId,
          entry.path,
          entry.patch.localState,
          entry.patch.localBlake3 ?? null,
          entry.patch.localSize ?? null,
          entry.patch.localMtime ?? null,
          now,
        ],
      );
    }
    await db.execute("COMMIT");
    emitFileStateChanged();
  } catch (err) {
    await db.execute("ROLLBACK");
    throw err;
  }
}

export async function getFileState(
  scope: FileStateScope,
  path: string,
): Promise<FileStateRow | null> {
  const db = getAppDatabase();
  const result = await db.execute(
    `SELECT path, local_state, local_blake3, local_size, local_mtime
       FROM file_state
      WHERE data_source_id = ? AND library_id = ? AND path = ?
      LIMIT 1`,
    [scope.dataSourceId, scope.libraryId, path],
  );
  const first = result.rows[0];
  return first ? rowFromRaw(first) : null;
}

export async function listFileStates(scope: FileStateScope): Promise<FileStateRow[]> {
  const db = getAppDatabase();
  const result = await db.execute(
    `SELECT path, local_state, local_blake3, local_size, local_mtime
       FROM file_state
      WHERE data_source_id = ? AND library_id = ?
      ORDER BY path`,
    [scope.dataSourceId, scope.libraryId],
  );
  return result.rows.map(rowFromRaw);
}

export async function deleteFileState(scope: FileStateScope, path: string): Promise<void> {
  const db = getAppDatabase();
  await db.execute(
    `DELETE FROM file_state WHERE data_source_id = ? AND library_id = ? AND path = ?`,
    [scope.dataSourceId, scope.libraryId, path],
  );
  emitFileStateChanged();
}

export async function clearFileStatesForLibrary(scope: FileStateScope): Promise<void> {
  const db = getAppDatabase();
  await db.execute(
    `DELETE FROM file_state WHERE data_source_id = ? AND library_id = ?`,
    [scope.dataSourceId, scope.libraryId],
  );
  emitFileStateChanged();
}
