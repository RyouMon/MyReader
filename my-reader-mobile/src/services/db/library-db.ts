import { Directory } from "expo-file-system"
import { open, type DB } from "@op-engineering/op-sqlite"
import { drizzle } from "drizzle-orm/op-sqlite"
import * as schema from "@my-reader/db/schema"

import MyReaderRustComponents from "@/modules/myreader-rust-components"
import type { Library } from "@my-reader/tools/types/library"
import { fileUriFor } from "../fs/path"
import {
  librarySidecarRootUri,
  LIBRARY_MYREADER_DIR,
} from "../fs/library-paths"

const LIBRARY_DB_FILE_NAME = "myreader.db"
const SIDECAR_RELATIVE_PATH = `${LIBRARY_MYREADER_DIR}/${LIBRARY_DB_FILE_NAME}`

export type LibraryDbHandle = {
  raw: DB
  db: ReturnType<typeof drizzle<typeof schema>>
  path: string
}

const dbCache = new Map<string, LibraryDbHandle>()
const dbInitPromise = new Map<string, Promise<LibraryDbHandle>>()

function ensureLibraryDataDir(libraryRoot: string): string {
  const dir = new Directory(libraryRoot, LIBRARY_MYREADER_DIR)
  if (!dir.exists) {
    dir.create({ idempotent: true, intermediates: true })
  }
  return dir.uri
}

function libraryDbUri(library: Library): string {
  const rootUri = librarySidecarRootUri(library)
  ensureLibraryDataDir(rootUri)
  return fileUriFor(rootUri, SIDECAR_RELATIVE_PATH)
}

function uriToNativePath(uri: string): string {
  if (uri.startsWith("file://")) {
    return decodeURIComponent(uri.slice(7))
  }
  return decodeURIComponent(uri)
}

/**
 * Returns a process-wide handle to the library-wide database.
 * Path: {libraryRoot}/.myreader/myreader.db
 *
 * Applies myreader-core migrations on first access.
 * Concurrent callers for the same database await the same init promise
 * to avoid "database is locked" on Android.
 */
export async function getLibraryDatabase(
  library: Library,
): Promise<LibraryDbHandle> {
  const dbUri = libraryDbUri(library)
  const cacheKey = dbUri

  const cached = dbCache.get(cacheKey)
  if (cached) return cached

  const inFlight = dbInitPromise.get(cacheKey)
  if (inFlight) return inFlight

  const promise = (async () => {
    let raw: DB | undefined

    try {
      const nativePath = uriToNativePath(dbUri)
      const lastSlash = nativePath.lastIndexOf("/")
      const location = lastSlash > 0 ? nativePath.slice(0, lastSlash) : "."
      const name = lastSlash >= 0 ? nativePath.slice(lastSlash + 1) : nativePath

      await MyReaderRustComponents.migrateLibraryDatabase(nativePath)

      raw = open({ name, location })
      const db = drizzle(raw, { schema })

      const handle = { raw, db, path: nativePath }
      dbCache.set(cacheKey, handle)
      return handle
    } catch (error) {
      if (raw) {
        try {
          await raw.closeAsync()
        } catch (closeError) {
          console.warn(
            "[library-db] close failed after initialization:",
            dbUri,
            closeError,
          )
        }
      }
      throw error
    } finally {
      dbInitPromise.delete(cacheKey)
    }
  })()

  dbInitPromise.set(cacheKey, promise)
  return promise
}

/**
 * Close and clear all cached library database connections.
 */
export async function closeAllLibraryDatabases(): Promise<void> {
  for (const [uri, handle] of dbCache) {
    try {
      await handle.raw.closeAsync()
    } catch (e) {
      console.warn("[library-db] close failed:", uri, e)
    }
  }
  dbCache.clear()
}
