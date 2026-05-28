import { open, type DB, type Scalar } from "@op-engineering/op-sqlite";

import { fileUriToNativeDirAndName } from "../fs/path";

/**
 * Lightweight adapter that mirrors the small slice of expo-sqlite's async API
 * the legacy call sites relied on.
 */
type OpenedDatabase = {
  getFirstAsync<T = Record<string, Scalar>>(
    sql: string,
    params?: Scalar | Scalar[],
  ): Promise<T | null>;
  getAllAsync<T = Record<string, Scalar>>(
    sql: string,
    params?: Scalar | Scalar[],
  ): Promise<T[]>;
  runAsync(sql: string, params?: Scalar | Scalar[]): Promise<void>;
  execAsync(sql: string): Promise<void>;
  closeAsync(): Promise<void>;
};

function wrapConnection(db: DB): OpenedDatabase {
  return {
    async getFirstAsync<T = Record<string, Scalar>>(sql: string, params?: Scalar | Scalar[]) {
      const bound = Array.isArray(params) ? params : params === undefined ? [] : [params];
      const result = await db.execute(sql, bound as Scalar[]);
      return ((result.rows[0] as T | undefined) ?? null) as T | null;
    },
    async getAllAsync<T = Record<string, Scalar>>(sql: string, params?: Scalar | Scalar[]) {
      const bound = Array.isArray(params) ? params : params === undefined ? [] : [params];
      const result = await db.execute(sql, bound as Scalar[]);
      return result.rows as T[];
    },
    async runAsync(sql: string, params?: Scalar | Scalar[]) {
      const bound = Array.isArray(params) ? params : params === undefined ? [] : [params];
      await db.execute(sql, bound as Scalar[]);
    },
    async execAsync(sql: string) {
      await db.execute(sql);
    },
    async closeAsync() {
      await db.closeAsync();
    },
  };
}

/**
 * Opens a read-only snapshot of an existing SQLite file on disk (Calibre metadata.db).
 * The caller must close the returned handle.
 */
export async function openDatabaseFromUri(uri: string): Promise<OpenedDatabase> {
  const { dir, name } = fileUriToNativeDirAndName(uri);
  const db = open({ name, location: dir });
  return wrapConnection(db);
}
