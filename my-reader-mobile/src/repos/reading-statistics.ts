import {
  readingCompletions,
  readingProgress,
  readingSessions,
} from "@my-reader/db/schema"
import type { Library } from "@my-reader/tools/types/library"
import { and, asc, eq, gte, lte } from "drizzle-orm"

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

export type ReadingCompletionInsert = {
  id: string
  bookId: number
  format: string
  localDay: string
  completedAt: number
  updatedAt: number
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
