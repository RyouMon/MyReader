import { useEffect, useState } from "react"
import {
  EMPTY_NAVIGATION,
  type CatalogToken,
} from "@my-reader/tools/catalog-navigation"
import type { BookItem } from "@/src/domain/types"
import { useCatalogBooks, useCatalogNavigation } from "./useLibraryQuery"

export function useCatalogSearch({
  libraryId,
  initialTokens,
  search,
  recentlyRead,
  books,
  loadingBooks,
  error,
  refetch,
}: {
  libraryId: string | null
  initialTokens: CatalogToken[]
  search: string
  recentlyRead: boolean
  books: BookItem[]
  loadingBooks: boolean
  error: Error | null
  refetch: () => unknown
}) {
  const [tokens, setTokens] = useState(initialTokens)
  useEffect(() => setTokens(initialTokens), [libraryId, initialTokens])
  const navigation = useCatalogNavigation(libraryId)
  const filtered = useCatalogBooks(libraryId, tokens, search, recentlyRead)
  const isFiltered = tokens.length > 0 || Boolean(search.trim()) || recentlyRead
  return {
    tokens,
    setTokens,
    isFiltered,
    title: tokens[0]?.value,
    navigation: navigation.data ?? EMPTY_NAVIGATION,
    resultBooks: isFiltered ? (filtered.data ?? []) : books,
    booksError: (isFiltered ? filtered.error : null) ?? error,
    isLoadingNewContent: isFiltered
      ? filtered.isLoading
      : loadingBooks && books.length === 0,
    refetchBooks: () => {
      void refetch()
      if (isFiltered) void filtered.refetch()
      void navigation.refetch()
    },
  }
}
