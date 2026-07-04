import { and, eq } from "drizzle-orm"

import { getLibraryDatabase } from "@/src/services/db/library-db"
import { uuid } from "@/src/utils/common"
import { bookCoverThumbnailCache } from "@my-reader/db/schema"
import type { BookCoverThumbnailCache } from "@my-reader/db/types"
import type { Library } from "@my-reader/tools/types/library"

export type BookCoverThumbnailCachePatch = {
  bookId: number
  coverIdentity: string
  thumbnailVersion: string
  widthPx: number
  heightPx: number
  fileName: string
  fileSizeBytes: number
}

export async function listBookCoverThumbnailCache(
  library: Library,
  input: {
    thumbnailVersion: string
    widthPx: number
    heightPx: number
  },
): Promise<BookCoverThumbnailCache[]> {
  const { db } = await getLibraryDatabase(library)
  return db
    .select()
    .from(bookCoverThumbnailCache)
    .where(
      and(
        eq(bookCoverThumbnailCache.thumbnailVersion, input.thumbnailVersion),
        eq(bookCoverThumbnailCache.widthPx, input.widthPx),
        eq(bookCoverThumbnailCache.heightPx, input.heightPx),
      ),
    )
    .orderBy(bookCoverThumbnailCache.bookId)
}

export async function upsertBookCoverThumbnailCache(
  library: Library,
  patch: BookCoverThumbnailCachePatch,
): Promise<void> {
  const { db } = await getLibraryDatabase(library)
  const now = Date.now()
  await db
    .insert(bookCoverThumbnailCache)
    .values({
      id: uuid(),
      bookId: patch.bookId,
      coverIdentity: patch.coverIdentity,
      thumbnailVersion: patch.thumbnailVersion,
      widthPx: patch.widthPx,
      heightPx: patch.heightPx,
      fileName: patch.fileName,
      fileSizeBytes: patch.fileSizeBytes,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        bookCoverThumbnailCache.bookId,
        bookCoverThumbnailCache.widthPx,
        bookCoverThumbnailCache.heightPx,
        bookCoverThumbnailCache.thumbnailVersion,
      ],
      set: {
        coverIdentity: patch.coverIdentity,
        fileName: patch.fileName,
        fileSizeBytes: patch.fileSizeBytes,
        updatedAt: now,
      },
    })
}

export async function deleteBookCoverThumbnailCache(
  library: Library,
  input: {
    bookId: number
    thumbnailVersion: string
    widthPx: number
    heightPx: number
  },
): Promise<void> {
  const { db } = await getLibraryDatabase(library)
  await db
    .delete(bookCoverThumbnailCache)
    .where(
      and(
        eq(bookCoverThumbnailCache.bookId, input.bookId),
        eq(bookCoverThumbnailCache.thumbnailVersion, input.thumbnailVersion),
        eq(bookCoverThumbnailCache.widthPx, input.widthPx),
        eq(bookCoverThumbnailCache.heightPx, input.heightPx),
      ),
    )
}

export async function clearBookCoverThumbnailCache(
  library: Library,
): Promise<void> {
  const { db } = await getLibraryDatabase(library)
  await db.delete(bookCoverThumbnailCache)
}
