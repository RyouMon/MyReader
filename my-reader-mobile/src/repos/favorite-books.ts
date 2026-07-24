import { and, eq } from "drizzle-orm"

import { getLibraryDatabase } from "@/src/services/db/library-db"
import { invalidateFavoriteBooks } from "@/src/services/query/invalidate-table"
import { favoriteBooks } from "@my-reader/db/schema"
import type { FavoriteBook } from "@my-reader/db/types"
import type { Library } from "@my-reader/tools/types/library"

export async function getFavoriteBook(
  library: Library,
  bookId: number,
): Promise<FavoriteBook | null> {
  const { db } = await getLibraryDatabase(library)
  const rows = await db
    .select()
    .from(favoriteBooks)
    .where(
      and(eq(favoriteBooks.bookId, bookId), eq(favoriteBooks.isFavorite, true)),
    )
  return rows[0] ?? null
}

export async function listFavoriteBooks(
  library: Library,
): Promise<FavoriteBook[]> {
  const { db } = await getLibraryDatabase(library)
  return db
    .select()
    .from(favoriteBooks)
    .where(eq(favoriteBooks.isFavorite, true))
    .orderBy(favoriteBooks.addedAt)
}

export async function clearFavoriteBooksForLibrary(
  library: Library,
): Promise<void> {
  const { db } = await getLibraryDatabase(library)
  await db.delete(favoriteBooks)
  await invalidateFavoriteBooks(library.id)
}
