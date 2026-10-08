import type { CalibreBook } from "@my-reader/tools/types/book"
import type { BuiltInBookCollectionId } from "@my-reader/tools/types/book-collection"
import { useMemo } from "react"
import { useFavoriteBooks } from "@/hooks/queries/useFavoriteBooksQuery"
import { useSpecialBookCollection } from "@/hooks/queries/useSpecialBookCollectionQuery"
import { usePaginatedBooks } from "@/hooks/reader/usePaginatedBooks"
import { isSpecialBookCollectionId } from "@/lib/bookCollections"
import type { LibrarySortOption } from "@/types/libraryUi"

interface LibraryCollectionOptions {
  libraryId: string | null
  collectionId: BuiltInBookCollectionId
  sortBy: LibrarySortOption
  search: string
  selectedFormatById: Record<string, string>
  isManagedLibrary: boolean
  isRemoteLibrary: boolean
}

export function useLibraryCollectionBooks({
  libraryId,
  collectionId,
  sortBy,
  search,
  selectedFormatById,
  isManagedLibrary,
  isRemoteLibrary,
}: LibraryCollectionOptions) {
  const isPaginatedCollection =
    collectionId === "all" || collectionId === "recentlyRead"
  const paginated = usePaginatedBooks(
    isPaginatedCollection ? libraryId : null,
    collectionId === "recentlyRead" ? "lastRead" : sortBy,
    search,
    isManagedLibrary,
  )
  const favorites = useFavoriteBooks(
    collectionId === "favorites" ? libraryId : null,
    sortBy,
    search,
  )
  const favoriteBooks = useMemo(
    () =>
      new Map<number, CalibreBook>(
        (favorites.data?.items ?? []).map((book, index) => [index, book]),
      ),
    [favorites.data?.items],
  )
  const special = useSpecialBookCollection({
    libraryId,
    collectionId,
    sortBy,
    search,
    selectedFormatById,
    isRemoteLibrary,
  })

  let collection = paginated
  if (collectionId === "favorites") {
    collection = {
      books: favoriteBooks,
      total: favorites.data?.total ?? 0,
      initialLoading: favorites.isLoading,
      error: favorites.error ? String(favorites.error) : null,
      ensureRange: () => undefined,
      refresh: () => void favorites.refetch(),
    }
  } else if (isSpecialBookCollectionId(collectionId)) {
    collection = special
  }

  return {
    collection,
    isPaginatedCollection,
    refreshCatalog: paginated.refresh,
  }
}
