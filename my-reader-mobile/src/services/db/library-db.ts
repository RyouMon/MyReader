import { Directory, File } from "expo-file-system";
import { open, type DB } from "@op-engineering/op-sqlite";
import { drizzle } from "drizzle-orm/op-sqlite";
import { migrate } from "drizzle-orm/op-sqlite/migrator";
import * as schema from "@my-reader/db/schema";
import migrations from "@my-reader/db/drizzle/migrations";

import type { Library } from "../../data/types";
import { resolveLibraryBooksDir } from "../fs/path";

const LIBRARY_DB_DIR_NAME = ".myreader";
const LIBRARY_DB_FILE_NAME = "myreader.db";

export type LibraryDbHandle = {
  raw: DB;
  db: ReturnType<typeof drizzle<typeof schema>>;
};

const dbCache = new Map<string, LibraryDbHandle>();
const dbInitPromise = new Map<string, Promise<LibraryDbHandle>>();

function getLibraryRootUri(library: Library): string {
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
 * Returns a process-wide handle to the library-wide database.
 * Path: {cacheDir}/book-downloads/{libraryId}/.myreader/myreader.db
 *
 * Applies Drizzle migrations on first access.
 * Concurrent callers for the same database await the same init promise
 * to avoid "database is locked" on Android.
 */
export async function getLibraryDatabase(library: Library): Promise<LibraryDbHandle> {
  const rootUri = getLibraryRootUri(library);
  const dbUri = libraryDbUri(rootUri);
  const cacheKey = dbUri;

  const cached = dbCache.get(cacheKey);
  if (cached) return cached;

  const inFlight = dbInitPromise.get(cacheKey);
  if (inFlight) return inFlight;

  const promise = (async () => {
    const nativePath = uriToNativePath(dbUri);
    const lastSlash = nativePath.lastIndexOf("/");
    const location = lastSlash > 0 ? nativePath.slice(0, lastSlash) : ".";
    const name = lastSlash >= 0 ? nativePath.slice(lastSlash + 1) : nativePath;

    const raw = open({ name, location });
    const db = drizzle(raw, { schema });

    await migrate(db, migrations);

    const handle = { raw, db };
    dbCache.set(cacheKey, handle);
    dbInitPromise.delete(cacheKey);
    return handle;
  })();

  dbInitPromise.set(cacheKey, promise);
  return promise;
}

/**
 * Close and clear all cached library database connections.
 */
export async function closeAllLibraryDatabases(): Promise<void> {
  for (const [uri, handle] of dbCache) {
    try {
      await handle.raw.closeAsync();
    } catch (e) {
      console.warn("[library-db] close failed:", uri, e);
    }
  }
  dbCache.clear();
}