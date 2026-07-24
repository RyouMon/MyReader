import { libraryId } from "@my-reader/db/schema/calibre"

import { withCalibreDb } from "@/src/services/db/calibre-db"

export async function getCalibreLibraryUuid(
  metadataUri: string,
): Promise<string> {
  return withCalibreDb(metadataUri, async (db) => {
    const row = await db.select({ uuid: libraryId.uuid }).from(libraryId).get()
    if (!row || typeof row.uuid !== "string" || row.uuid.length === 0) {
      throw new Error("Calibre library UUID is missing")
    }
    return row.uuid.toLowerCase()
  })
}
