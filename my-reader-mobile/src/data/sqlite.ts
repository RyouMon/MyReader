import { Directory, File as FSFile, Paths } from "expo-file-system";
import { open, type DB, type Scalar } from "@op-engineering/op-sqlite";

const APP_DB_NAME = "myreader.sqlite";
const APP_DB_DIR_NAME = "app-db";
let appDbInstance: DB | null = null;

/**
 * Lightweight adapter that mirrors the small slice of expo-sqlite's async API
 * the legacy call sites relied on. Keeps the migration mechanical.
 */
export type OpenedDatabase = {
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

function uriToDirAndName(fileUri: string): { dir: string; name: string } {
  const withoutScheme = fileUri.replace(/^file:\/\//, "");
  const decoded = decodeURIComponent(withoutScheme);
  const lastSlash = decoded.lastIndexOf("/");
  if (lastSlash <= 0) {
    throw new Error(`无法解析数据库路径: ${fileUri}`);
  }
  return {
    dir: decoded.slice(0, lastSlash),
    name: decoded.slice(lastSlash + 1),
  };
}

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
 * The caller must close the returned handle. op-sqlite keeps connections alive across
 * an app session, so short-lived opens are fine for ad-hoc reads.
 */
export async function openDatabaseFromUri(uri: string): Promise<OpenedDatabase> {
  const { dir, name } = uriToDirAndName(uri);
  const db = open({ name, location: dir });
  return wrapConnection(db);
}

function ensureAppDbDirectory(): string {
  const baseDir = new Directory(Paths.document, APP_DB_DIR_NAME);
  if (!baseDir.exists) {
    baseDir.create({ idempotent: true, intermediates: true });
  }
  return decodeURIComponent(baseDir.uri.replace(/^file:\/\//, "")).replace(/\/$/, "");
}

/**
 * Returns a process-wide handle to the persistent app database used for sync metadata.
 * Creates the file + schema lazily on first access.
 */
export function getAppDatabase(): DB {
  if (appDbInstance) return appDbInstance;
  const location = ensureAppDbDirectory();
  const db = open({ name: APP_DB_NAME, location });
  ensureAppSchema(db);
  appDbInstance = db;
  return db;
}

export function getAppDatabaseFilePath(): string {
  const location = ensureAppDbDirectory();
  return `${location}/${APP_DB_NAME}`;
}

function ensureAppSchema(db: DB): void {
  db.executeSync(`
    CREATE TABLE IF NOT EXISTS file_state (
      data_source_id TEXT NOT NULL,
      library_id     TEXT NOT NULL,
      path           TEXT NOT NULL,
      local_state    TEXT NOT NULL,
      local_blake3   TEXT,
      local_size     INTEGER,
      local_mtime    INTEGER,
      updated_at     INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (data_source_id, library_id, path)
    );
  `);
  db.executeSync(`
    CREATE TABLE IF NOT EXISTS sync_meta (
      scope TEXT NOT NULL,
      key   TEXT NOT NULL,
      value TEXT,
      PRIMARY KEY (scope, key)
    );
  `);
}

/**
 * Best-effort destruction, primarily for tests.
 */
export async function closeAppDatabase(): Promise<void> {
  if (!appDbInstance) return;
  await appDbInstance.closeAsync();
  appDbInstance = null;
}

export function deleteDbFileByUri(uri: string): void {
  const file = new FSFile(uri);
  if (file.exists) {
    file.delete();
  }
}
