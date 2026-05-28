import { eq } from "drizzle-orm";

import { uuid } from "@/src/utils/common";
import { syncMeta } from "@my-reader/db/schema";
import { getLibraryDatabase } from "../services/db/library-db";
import type { Library } from "@my-reader/tools/types/library";

export async function getSyncMeta(library: Library, key: string): Promise<string | null> {
  const { db } = await getLibraryDatabase(library);
  const rows = await db
    .select()
    .from(syncMeta)
    .where(eq(syncMeta.key, key));
  const first = rows[0];
  if (!first) return null;
  return first.value;
}

export async function setSyncMeta(
  library: Library,
  key: string,
  value: string | null,
): Promise<void> {
  const { db } = await getLibraryDatabase(library);
  if (value === null) {
    await db.delete(syncMeta).where(eq(syncMeta.key, key));
    return;
  }
  const id = uuid();
  await db
    .insert(syncMeta)
    .values({ id, key, value })
    .onConflictDoUpdate({
      target: [syncMeta.key],
      set: { value },
    });
}

export async function clearSyncMeta(library: Library): Promise<void> {
  const { db } = await getLibraryDatabase(library);
  await db.delete(syncMeta);
}