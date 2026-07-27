import type { Library } from "@my-reader/tools/types/library"

import { setFavoriteBook } from "@/src/services/core/reading"
import { invalidateFavoriteBooks } from "@/src/services/query/invalidate-table"

export async function addFavoriteBook(
  library: Library,
  bookId: number,
): Promise<void> {
  await setFavoriteBook(library, bookId, true)
  await invalidateFavoriteBooks(library.id)
}

export async function removeFavoriteBook(
  library: Library,
  bookId: number,
): Promise<void> {
  await setFavoriteBook(library, bookId, false)
  await invalidateFavoriteBooks(library.id)
}
