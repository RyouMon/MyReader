import { open, type DB } from "@op-engineering/op-sqlite"
import { drizzle } from "drizzle-orm/op-sqlite"
import * as calibreSchema from "@my-reader/db/schema/calibre"

import { fileUriToNativeDirAndName } from "../fs/path"

export type CalibreDbHandle = {
  raw: DB
  db: ReturnType<typeof drizzle<typeof calibreSchema>>
}

/**
 * Opens a read-only connection to a Calibre metadata.db and wraps it
 * with a Drizzle instance using the calibre schema definitions.
 *
 * The caller must close the returned handle when done.
 */
export function openCalibreDatabase(metadataUri: string): CalibreDbHandle {
  const { dir, name } = fileUriToNativeDirAndName(metadataUri)
  const raw = open({ name, location: dir })
  const db = drizzle(raw, { schema: calibreSchema })
  return { raw, db }
}

export async function withCalibreDb<T>(
  metadataUri: string,
  fn: (db: CalibreDbHandle["db"]) => Promise<T>,
): Promise<T> {
  const handle = openCalibreDatabase(metadataUri)
  try {
    return await fn(handle.db)
  } finally {
    await handle.raw.closeAsync()
  }
}
