import type { Library } from "@my-reader/tools/types/library"

import { invalidateFavoriteBooks } from "@/src/services/query/invalidate-table"
import { writeLocalFavorite } from "../sync/library-sidecar/favorite"

export async function addFavoriteBook(
  library: Library,
  bookId: number,
): Promise<void> {
  await writeLocalFavorite(library, bookId, true)
  await invalidateFavoriteBooks(library.id)
}

export async function removeFavoriteBook(
  library: Library,
  bookId: number,
): Promise<void> {
  await writeLocalFavorite(library, bookId, false)
  await invalidateFavoriteBooks(library.id)
}
