import { eq } from "drizzle-orm"

import { bookReadingFormat } from "@my-reader/db/schema"
import type { BookReadingFormat } from "@my-reader/db/types"
import { getLibraryDatabase } from "@/src/services/db/library-db"
import { invalidateBookReadingFormat } from "@/src/services/query/invalidate-table"
import { uuid } from "@/src/utils/common"
import type { Library } from "@my-reader/tools/types/library"

export async function getBookReadingFormat(
  library: Library,
  bookId: number,
): Promise<BookReadingFormat | null> {
  const { db } = await getLibraryDatabase(library)
  const rows = await db
    .select()
    .from(bookReadingFormat)
    .where(eq(bookReadingFormat.bookId, bookId))
  return rows[0] ?? null
}

export async function listBookReadingFormats(
  library: Library,
): Promise<BookReadingFormat[]> {
  const { db } = await getLibraryDatabase(library)
  return db.select().from(bookReadingFormat).orderBy(bookReadingFormat.bookId)
}

export async function setBookReadingFormat(
  library: Library,
  bookId: number,
  format: string,
): Promise<void> {
  const { db } = await getLibraryDatabase(library)
  const fmt = format.toUpperCase()
  const updatedAt = Date.now()
  await db
    .insert(bookReadingFormat)
    .values({
      id: uuid(),
      bookId,
      readingFormat: fmt,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: [bookReadingFormat.bookId],
      set: { readingFormat: fmt, updatedAt },
    })
  await invalidateBookReadingFormat(library.id)
}

export async function clearBookReadingFormat(
  library: Library,
  bookId: number,
): Promise<void> {
  const { db } = await getLibraryDatabase(library)
  await db.delete(bookReadingFormat).where(eq(bookReadingFormat.bookId, bookId))
  await invalidateBookReadingFormat(library.id)
}

export async function clearBookReadingFormatsForLibrary(
  library: Library,
): Promise<void> {
  const { db } = await getLibraryDatabase(library)
  await db.delete(bookReadingFormat)
  await invalidateBookReadingFormat(library.id)
}
