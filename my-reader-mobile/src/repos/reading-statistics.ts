import {
  readingCompletions,
  readingProgress,
  readingSessions,
} from "@my-reader/db/schema"
import type { Library } from "@my-reader/tools/types/library"
import { and, asc, eq, gte, lte, sql } from "drizzle-orm"

import { getLibraryDatabase } from "@/src/services/db/library-db"

export type ReadingSessionInterval = {
  id: string
  bookId: number
  format: string
  localDay: string
  startedAt: number
  durationSeconds: number
  updatedAt: number
}

export async function addReadingSessionInterval(
  library: Library,
  interval: ReadingSessionInterval,
): Promise<void> {
  const { db } = await getLibraryDatabase(library)
  await db
    .insert(readingSessions)
    .values({ ...interval, format: interval.format.toUpperCase() })
    .onConflictDoUpdate({
      target: readingSessions.id,
      set: {
        durationSeconds: sql<number>`${readingSessions.durationSeconds} + excluded.duration_seconds`,
        updatedAt: interval.updatedAt,
      },
    })
}

export type ReadingCompletionInsert = {
  id: string
  bookId: number
  format: string
  localDay: string
  completedAt: number
  updatedAt: number
}

export async function upsertEarliestReadingCompletion(
  library: Library,
  completion: ReadingCompletionInsert,
): Promise<boolean> {
  const { db } = await getLibraryDatabase(library)
  const rows = await db
    .insert(readingCompletions)
    .values({ ...completion, format: completion.format.toUpperCase() })
    .onConflictDoUpdate({
      target: readingCompletions.bookId,
      set: {
        format: completion.format.toUpperCase(),
        localDay: completion.localDay,
        completedAt: completion.completedAt,
        updatedAt: completion.updatedAt,
      },
      setWhere: sql`excluded.completed_at < ${readingCompletions.completedAt}`,
    })
    .returning({ id: readingCompletions.id })
  return rows.length > 0
}

export async function listReadingSessionsByDayRange(
  library: Library,
  startDay: string,
  endDay: string,
) {
  const { db } = await getLibraryDatabase(library)
  return db
    .select({
      localDay: readingSessions.localDay,
      durationSeconds: readingSessions.durationSeconds,
    })
    .from(readingSessions)
    .where(
      and(
        gte(readingSessions.localDay, startDay),
        lte(readingSessions.localDay, endDay),
      ),
    )
}

export async function listReadingCompletionsByDayRange(
  library: Library,
  startDay: string,
  endDay: string,
) {
  const { db } = await getLibraryDatabase(library)
  return db
    .select({
      bookId: readingCompletions.bookId,
      localDay: readingCompletions.localDay,
    })
    .from(readingCompletions)
    .where(
      and(
        gte(readingCompletions.localDay, startDay),
        lte(readingCompletions.localDay, endDay),
      ),
    )
}

export async function listLegacyFinishedProgress(library: Library) {
  const { db } = await getLibraryDatabase(library)
  return db
    .select({
      bookId: readingProgress.bookId,
      format: readingProgress.format,
      updatedAt: readingProgress.updatedAt,
    })
    .from(readingProgress)
    .where(eq(readingProgress.displayProgression, 1))
    .orderBy(asc(readingProgress.updatedAt))
}
