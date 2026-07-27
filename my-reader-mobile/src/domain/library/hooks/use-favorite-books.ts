import { useQuery } from "@tanstack/react-query"
import { useEffect, useMemo } from "react"

import type { BookItem, Library } from "@/src/domain/types"
import { listFavoriteBookIds } from "@/src/services/core/reading"
import { queryClient } from "@/src/services/query/query-client"
import { queryKeys } from "@/src/services/query/query-keys"
import { addFavoriteBook, removeFavoriteBook } from "../favorite-books"

const emptySet = new Set<string>()

export async function fetchFavoriteBookIds(
  selectedLibrary: Library | null,
): Promise<string[]> {
  if (!selectedLibrary) return []
  const ids = await listFavoriteBookIds(selectedLibrary)
  return ids.map(String)
}

export function useFavoriteBooks(
  selectedLibrary: Library | null,
  books: BookItem[],
) {
  const bookIds = useMemo(() => new Set(books.map((b) => b.id)), [books])

  const query = useQuery({
    queryKey: queryKeys.favoriteBooks(selectedLibrary?.id),
    queryFn: () => fetchFavoriteBookIds(selectedLibrary),
    enabled: !!selectedLibrary,
    staleTime: 0,
  })

  const favoriteSet = useMemo(() => {
    if (!query.data) return emptySet
    const source =
      typeof query.data[Symbol.iterator] === "function" ? query.data : []
    const next = new Set<string>()
    for (const id of source) {
      if (bookIds.has(id)) {
        next.add(id)
      }
    }
    return next
  }, [query.data, bookIds])

  useEffect(() => {
    if (selectedLibrary && query.data && !Array.isArray(query.data)) {
      queryClient.invalidateQueries({
        queryKey: queryKeys.favoriteBooks(selectedLibrary.id),
      })
    }
  }, [selectedLibrary, query.data])

  const isFavorite = (bookId: string) => favoriteSet.has(bookId)

  const toggleFavorite = async (bookId: string) => {
    if (!selectedLibrary) return
    const numericId = Number(bookId)
    if (!Number.isFinite(numericId) || numericId <= 0) return

    if (favoriteSet.has(bookId)) {
      await removeFavoriteBook(selectedLibrary, numericId)
    } else {
      await addFavoriteBook(selectedLibrary, numericId)
    }
  }

  return { favoriteSet, isFavorite, toggleFavorite }
}
