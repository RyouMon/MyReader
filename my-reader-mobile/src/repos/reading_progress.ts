import { and, eq } from "drizzle-orm";

import { uuid } from "@/src/utils/common";
import { readingProgress } from "@my-reader/db/schema";
import { getLibraryDatabase } from "../services/db/library-db";
import type { Library } from "@my-reader/tools/types/library";

export async function getReadingProgressRow(
  library: Library,
  bookId: number,
  format: string,
): Promise<{ locatorJson: string } | null> {
  const fmt = format.toUpperCase();
  const { db } = await getLibraryDatabase(library);
  const rows = await db
    .select()
    .from(readingProgress)
    .where(
      and(
        eq(readingProgress.bookId, bookId),
        eq(readingProgress.format, fmt),
      ),
    );
  const row = rows[0];
  if (!row) return null;
  return { locatorJson: row.locatorJson };
}

export async function setReadingProgressRow(
  library: Library,
  bookId: number,
  format: string,
  locatorJson: string,
): Promise<void> {
  const fmt = format.toUpperCase();
  const updatedAt = Date.now();
  const id = uuid();
  const { db } = await getLibraryDatabase(library);
  await db
    .insert(readingProgress)
    .values({ id, bookId, format: fmt, locatorJson, updatedAt })
    .onConflictDoUpdate({
      target: [readingProgress.bookId, readingProgress.format],
      set: { locatorJson, updatedAt },
    });
}