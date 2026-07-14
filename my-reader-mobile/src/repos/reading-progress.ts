import { readingProgress } from "@my-reader/db/schema"
import type { ReadingProgress } from "@my-reader/db/types"
import type { Library } from "@my-reader/tools/types/library"
import { and, eq, gte, sql } from "drizzle-orm"
import { getLibraryDatabase } from "@/src/services/db/library-db"
import {
  invalidateReadingProgress,
  invalidateRecentlyReadBooks,
} from "@/src/services/query/invalidate-table"
import { uuid } from "@/src/utils/common"

export async function getReadingProgressRow(
  library: Library,
  bookId: number,
  format: string,
): Promise<ReadingProgress | null> {
  const fmt = format.toUpperCase()
  const { db } = await getLibraryDatabase(library)
  const rows = await db
    .select()
    .from(readingProgress)
    .where(
      and(eq(readingProgress.bookId, bookId), eq(readingProgress.format, fmt)),
    )
  return rows[0] ?? null
}

export type ReadingProgressUpsert = {
  bookId: number
  format: string
  locatorJson: string
  updatedAt: number
}

export type UpsertReadingProgressOptions = {
  invalidate?: boolean
}

export type LocalReadingProgressUpsert = Omit<
  ReadingProgressUpsert,
  "updatedAt"
>

export async function upsertReadingProgress(
  library: Library,
  patch: LocalReadingProgressUpsert,
  options?: UpsertReadingProgressOptions,
): Promise<void> {
  const now = Date.now()
  const fmt = patch.format.toUpperCase()
  const { db } = await getLibraryDatabase(library)
  await db
    .insert(readingProgress)
    .values({
      id: uuid(),
      bookId: patch.bookId,
      format: fmt,
      locatorJson: patch.locatorJson,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [readingProgress.bookId, readingProgress.format],
      set: {
        locatorJson: patch.locatorJson,
        updatedAt: sql<number>`max(excluded.updated_at, ${readingProgress.updatedAt} + 1)`,
      },
    })

  if (options?.invalidate ?? true) {
    void invalidateReadingProgress(library.id)
    void invalidateRecentlyReadBooks(library.id)
  }
}

/** Atomically applies timestamp then BINARY locator JSON LWW ordering. */
export async function upsertReadingProgressIfNewer(
  library: Library,
  patch: ReadingProgressUpsert,
): Promise<boolean> {
  const fmt = patch.format.toUpperCase()
  const { db } = await getLibraryDatabase(library)
  const rows = await db
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
      set: {
        locatorJson: patch.locatorJson,
        updatedAt: patch.updatedAt,
      },
      setWhere: sql`
        excluded.updated_at > ${readingProgress.updatedAt}
        OR (
          excluded.updated_at = ${readingProgress.updatedAt}
          AND excluded.locator_json COLLATE BINARY > ${readingProgress.locatorJson} COLLATE BINARY
        )
      `,
    })
    .returning({ id: readingProgress.id })
  return rows.length > 0
}

export type ReadingProgressChangeRow = {
  bookId: number
  format: string
  locatorJson: string
  updatedAt: number
}

export async function listAllReadingProgress(
  library: Library,
): Promise<ReadingProgressChangeRow[]> {
  const { db } = await getLibraryDatabase(library)
  return db
    .select({
      bookId: readingProgress.bookId,
      format: readingProgress.format,
      locatorJson: readingProgress.locatorJson,
      updatedAt: readingProgress.updatedAt,
    })
    .from(readingProgress)
    .orderBy(readingProgress.updatedAt)
}

export async function listReadingProgressAtOrAfter(
  library: Library,
  sinceMs: number,
): Promise<ReadingProgressChangeRow[]> {
  const { db } = await getLibraryDatabase(library)
  return db
    .select({
      bookId: readingProgress.bookId,
      format: readingProgress.format,
      locatorJson: readingProgress.locatorJson,
      updatedAt: readingProgress.updatedAt,
    })
    .from(readingProgress)
    .where(gte(readingProgress.updatedAt, sinceMs))
    .orderBy(readingProgress.updatedAt)
}
