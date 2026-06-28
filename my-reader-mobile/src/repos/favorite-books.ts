import { eq } from "drizzle-orm"

import { getLibraryDatabase } from "@/src/services/db/library-db"
import { invalidateFavoriteBooks } from "@/src/services/query/invalidate-table"
import { uuid } from "@/src/utils/common"
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
    .where(eq(favoriteBooks.bookId, bookId))
  return rows[0] ?? null
}

export async function listFavoriteBooks(
  library: Library,
): Promise<FavoriteBook[]> {
  const { db } = await getLibraryDatabase(library)
  return db.select().from(favoriteBooks).orderBy(favoriteBooks.addedAt)
}

export async function addFavoriteBook(
  library: Library,
  bookId: number,
): Promise<void> {
  const { db } = await getLibraryDatabase(library)
  const addedAt = Date.now()
  await db
    .insert(favoriteBooks)
    .values({
      id: uuid(),
      bookId,
      addedAt,
    })
    .onConflictDoNothing({
      target: favoriteBooks.bookId,
    })
  await invalidateFavoriteBooks(library.id)
}

export async function removeFavoriteBook(
  library: Library,
  bookId: number,
): Promise<void> {
  const { db } = await getLibraryDatabase(library)
  await db.delete(favoriteBooks).where(eq(favoriteBooks.bookId, bookId))
  await invalidateFavoriteBooks(library.id)
}

export async function clearFavoriteBooksForLibrary(
  library: Library,
): Promise<void> {
  const { db } = await getLibraryDatabase(library)
  await db.delete(favoriteBooks)
  await invalidateFavoriteBooks(library.id)
}
