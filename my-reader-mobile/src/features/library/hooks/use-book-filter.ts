import { useMemo } from "react"

import type { BookItem } from "@/src/domain/types"

export type SortOption = "title" | "author" | "recentlyAdded"
export type LibraryFilterOption =
  | "all"
  | "favorites"
  | "downloaded"
  | "notDownloaded"
  | "downloading"

/** Compares newest Calibre additions first, falling back to id for older rows without timestamps. */
function compareRecentlyAdded(left: BookItem, right: BookItem): number {
  const byTimestamp = (right.timestamp ?? "").localeCompare(
    left.timestamp ?? "",
  )
  if (byTimestamp !== 0) return byTimestamp

  const leftId = left.calibreId ?? Number(left.id)
  const rightId = right.calibreId ?? Number(right.id)
  if (Number.isFinite(leftId) && Number.isFinite(rightId)) {
    return rightId - leftId
  }

  return left.id.localeCompare(right.id, "zh-CN", { numeric: true })
}

/** Filters and sorts books by query (title / author / authors), then by the active library filter. */
export function useBookFilter(
  books: BookItem[],
  debouncedQuery: string,
  sortBy: SortOption,
  filter: LibraryFilterOption,
  bookDownloadStatusById: Record<string, string>,
  favoriteBookIds: Set<string> = new Set(),
) {
  const sortedSearchedBooks = useMemo(() => {
    const needle = debouncedQuery.trim().toLowerCase()
    const searchedBooks = !needle
      ? books
      : books.filter((book) => {
          const authorMatches = book.authors?.some((author) =>
            author.toLowerCase().includes(needle),
          )
          return (
            book.title.toLowerCase().includes(needle) ||
            book.author.toLowerCase().includes(needle) ||
            Boolean(authorMatches)
          )
        })

    return [...searchedBooks].sort((left, right) => {
      switch (sortBy) {
        case "author":
          return left.author.localeCompare(right.author, "zh-CN")
        case "recentlyAdded":
          return compareRecentlyAdded(left, right)
        case "title":
        default:
          return left.title.localeCompare(right.title, "zh-CN")
      }
    })
  }, [books, debouncedQuery, sortBy])

  const visibleBooks = useMemo(() => {
    if (filter === "favorites") {
      return sortedSearchedBooks.filter((book) => favoriteBookIds.has(book.id))
    }
    if (filter === "all") return sortedSearchedBooks
    return sortedSearchedBooks.filter(
      (book) => (bookDownloadStatusById[book.id] ?? "notDownloaded") === filter,
    )
  }, [bookDownloadStatusById, favoriteBookIds, filter, sortedSearchedBooks])

  return { sortedSearchedBooks, visibleBooks }
}
