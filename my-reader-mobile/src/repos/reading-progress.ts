import { and, eq, gt } from "drizzle-orm";

import { getLibraryDatabase } from "@/src/services/db/library-db";
import { uuid } from "@/src/utils/common";
import { readingProgress } from "@my-reader/db/schema";
import type { ReadingProgress } from "@my-reader/db/types";
import type { Library } from "@my-reader/tools/types/library";

import {
  invalidateReadingProgress,
  invalidateRecentlyReadBooks,
} from "@/src/services/query/invalidate-table";

export async function getReadingProgressRow(
  library: Library,
  bookId: number,
  format: string,
): Promise<ReadingProgress | null> {
  const fmt = format.toUpperCase();
  const { db } = await getLibraryDatabase(library);
  const rows = await db
    .select()
    .from(readingProgress)
    .where(and(eq(readingProgress.bookId, bookId), eq(readingProgress.format, fmt)));
  return rows[0] ?? null;
}

export async function getReadingProgressUpdatedAt(
  library: Library,
  bookId: number,
  format: string,
): Promise<number | null> {
  const fmt = format.toUpperCase();
  const { db } = await getLibraryDatabase(library);
  const rows = await db
    .select({ updatedAt: readingProgress.updatedAt })
    .from(readingProgress)
    .where(and(eq(readingProgress.bookId, bookId), eq(readingProgress.format, fmt)));
  const row = rows[0];
  return row ? Number(row.updatedAt) : null;
}

export type ReadingProgressUpsert = {
  bookId: number;
  format: string;
  locatorJson: string;
  updatedAt: number;
};

export type UpsertReadingProgressOptions = {
  invalidate?: boolean;
};

export async function upsertReadingProgress(
  library: Library,
  patch: ReadingProgressUpsert,
  options?: UpsertReadingProgressOptions,
): Promise<void> {
  const fmt = patch.format.toUpperCase();
  const { db } = await getLibraryDatabase(library);
  await db
    .insert(readingProgress)
    .values({
      id: uuid(),
      bookId: patch.bookId,
      format: fmt,
      locatorJson: patch.locatorJson,
      updatedAt: patch.updatedAt,
    })
    .onConflictDoUpdate({
      target: [readingProgress.bookId, readingProgress.format],
      set: { locatorJson: patch.locatorJson, updatedAt: patch.updatedAt },
    });

  if (options?.invalidate ?? true) {
    void invalidateReadingProgress(library.id);
    void invalidateRecentlyReadBooks(library.id);
  }
}

export type ReadingProgressChangeRow = {
  bookId: number;
  format: string;
  locatorJson: string;
  updatedAt: number;
};

export async function listAllReadingProgress(
  library: Library,
): Promise<ReadingProgressChangeRow[]> {
  const { db } = await getLibraryDatabase(library);
  return db
    .select({
      bookId: readingProgress.bookId,
      format: readingProgress.format,
      locatorJson: readingProgress.locatorJson,
      updatedAt: readingProgress.updatedAt,
    })
    .from(readingProgress)
    .orderBy(readingProgress.updatedAt);
}

export async function listReadingProgressSince(
  library: Library,
  sinceMs: number,
): Promise<ReadingProgressChangeRow[]> {
  const { db } = await getLibraryDatabase(library);
  return db
    .select({
      bookId: readingProgress.bookId,
      format: readingProgress.format,
      locatorJson: readingProgress.locatorJson,
      updatedAt: readingProgress.updatedAt,
    })
    .from(readingProgress)
    .where(gt(readingProgress.updatedAt, sinceMs))
    .orderBy(readingProgress.updatedAt);
}
