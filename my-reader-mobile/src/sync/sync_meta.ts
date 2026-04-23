import { getAppDatabase } from "../data/sqlite";

/**
 * `sync_meta` is a namespaced key/value table used for per-scope metadata
 * (manifest versions, last pull timestamps, device ids, etc.) without needing
 * dedicated tables for every new knob.
 */
export async function getSyncMeta(scope: string, key: string): Promise<string | null> {
  const db = getAppDatabase();
  const result = await db.execute(
    `SELECT value FROM sync_meta WHERE scope = ? AND key = ? LIMIT 1`,
    [scope, key],
  );
  const first = result.rows[0];
  if (!first || first.value == null) return null;
  return String(first.value);
}

export async function setSyncMeta(
  scope: string,
  key: string,
  value: string | null,
): Promise<void> {
  const db = getAppDatabase();
  if (value === null) {
    await db.execute(`DELETE FROM sync_meta WHERE scope = ? AND key = ?`, [scope, key]);
    return;
  }
  await db.execute(
    `INSERT INTO sync_meta (scope, key, value) VALUES (?, ?, ?)
     ON CONFLICT(scope, key) DO UPDATE SET value = excluded.value`,
    [scope, key, value],
  );
}

export async function clearSyncMeta(scope: string): Promise<void> {
  const db = getAppDatabase();
  await db.execute(`DELETE FROM sync_meta WHERE scope = ?`, [scope]);
}
