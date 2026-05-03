import { Directory, File } from "expo-file-system";
import { open, type DB } from "@op-engineering/op-sqlite";

import type { Library } from "./types";
import { resolveLibraryBooksDir } from "../sync/backend";

const LIBRARY_DB_DIR_NAME = ".myreader";
const LIBRARY_DB_FILE_NAME = "myreader.db";

const READING_PROGRESS_SCHEMA = `
CREATE TABLE IF NOT EXISTS reading_progress (
  book_id    INTEGER NOT NULL,
  format     TEXT NOT NULL COLLATE NOCASE,
  anchor_json TEXT NOT NULL,
  updated_at REAL NOT NULL,
  PRIMARY KEY (book_id, format)
);
`;

const dbCache = new Map<string, DB>();

function getLibraryRootUri(library: Library): string {
  // op-sqlite uses POSIX C file I/O and cannot write to iOS security-scoped
  // bookmark paths. Always keep myreader.db in app docs dir. For iCloud sync,
  // change files are written to the library directory via expo-file-system
  // inside withSecurityScopedLibraryAccess in db_sync.ts.
  return resolveLibraryBooksDir(library.id);
}

function ensureLibraryDataDir(libraryRootUri: string): string {
  const dir = new Directory(libraryRootUri, LIBRARY_DB_DIR_NAME);
  if (!dir.exists) {
    dir.create({ idempotent: true, intermediates: true });
  }
  return dir.uri;
}

function libraryDbUri(libraryRootUri: string): string {
  const dataDir = ensureLibraryDataDir(libraryRootUri);
  const file = new File(dataDir, LIBRARY_DB_FILE_NAME);
  return file.uri;
}


function uriToNativePath(uri: string): string {
  if (uri.startsWith("file://")) {
    return decodeURIComponent(uri.slice(7));
  }
  return decodeURIComponent(uri);
}

/**
 * 返回书库级数据库的 process-wide handle。
 * 路径：{cacheDir}/book-downloads/{libraryId}/.myreader/myreader.db
 *
 * 首次打开时自动创建 schema，并对 reading_progress 表执行 crsql_as_crr。
 */
export function getLibraryDatabase(library: Library): DB {
  const rootUri = getLibraryRootUri(library);
  const dbUri = libraryDbUri(rootUri);
  const cacheKey = dbUri;

  const cached = dbCache.get(cacheKey);
  if (cached) return cached;

  const nativePath = uriToNativePath(dbUri);
  const lastSlash = nativePath.lastIndexOf("/");
  const location = lastSlash > 0 ? nativePath.slice(0, lastSlash) : ".";
  const name = lastSlash >= 0 ? nativePath.slice(lastSlash + 1) : nativePath;

  const db = open({ name, location });

  db.executeSync(READING_PROGRESS_SCHEMA);

  try {
    db.executeSync(`SELECT crsql_as_crr('reading_progress');`);
  } catch (e) {
    console.warn(
      "[library-db] crsql_as_crr failed for reading_progress; sync may not work.",
      e,
    );
  }

  dbCache.set(cacheKey, db);
  return db;
}

/**
 * 关闭并清空所有缓存的书库级数据库连接。主要用于测试。
 */
export async function closeAllLibraryDatabases(): Promise<void> {
  for (const [uri, db] of dbCache) {
    try {
      await db.closeAsync();
    } catch (e) {
      console.warn("[library-db] close failed:", uri, e);
    }
  }
  dbCache.clear();
}
