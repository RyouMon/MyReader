import type { BuiltInBookCollectionId } from "@my-reader/tools/types/book-collection"
import { useMemo } from "react"

import type { BookItem } from "@/src/domain/types"

export type SortOption = "title" | "author" | "recentlyAdded" | "recentlyRead"

type SelectBooksForCollectionInput = {
  books: BookItem[]
  recentlyReadBooks: BookItem[]
  collectionId: BuiltInBookCollectionId
  query: string
  sortBy: SortOption
  bookActiveFormatsById: ReadonlyMap<string, string>
  bookDownloadStatusById: Record<string, string>
  bookUploadStatusById: Record<string, string>
  bookLocalOnlyById: Record<string, boolean>
  favoriteBookIds: Set<string>
}

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

export function defaultSortOptionForCollection(
  collectionId: BuiltInBookCollectionId,
): SortOption {
  return collectionId === "recentlyRead" ? "recentlyRead" : "recentlyAdded"
}

/** Selects one stable book collection, then applies search and the chosen ordering. */
export function selectBooksForCollection({
  books,
  recentlyReadBooks,
  collectionId,
  query,
  sortBy,
  bookActiveFormatsById,
  bookDownloadStatusById,
  bookUploadStatusById,
  bookLocalOnlyById,
  favoriteBookIds,
}: SelectBooksForCollectionInput): BookItem[] {
  let collectionBooks: BookItem[]
  switch (collectionId) {
    case "recentlyRead":
      collectionBooks = recentlyReadBooks
      break
    case "favorites":
      collectionBooks = books.filter((book) => favoriteBookIds.has(book.id))
      break
    case "downloaded":
      collectionBooks = books.filter(
        (book) => bookDownloadStatusById[book.id] === "downloaded",
      )
      break
    case "downloading":
      collectionBooks = books.filter((book) =>
        bookActiveFormatsById.has(book.id),
      )
      break
    case "uploading":
      collectionBooks = books.filter((book) =>
        Boolean(bookUploadStatusById[book.id]),
      )
      break
    case "localOnly":
      collectionBooks = books.filter((book) => bookLocalOnlyById[book.id])
      break
    case "all":
      collectionBooks = books
      break
  }

  const needle = query.trim().toLowerCase()
  const searchedBooks = !needle
    ? collectionBooks
    : collectionBooks.filter((book) => {
        const authorMatches = book.authors?.some((author) =>
          author.toLowerCase().includes(needle),
        )
        return (
          book.title.toLowerCase().includes(needle) ||
          book.author.toLowerCase().includes(needle) ||
          Boolean(authorMatches)
        )
      })

  if (sortBy === "recentlyRead") {
    return [...searchedBooks]
  }

  return [...searchedBooks].sort((left, right) => {
    switch (sortBy) {
      case "author":
        return left.author.localeCompare(right.author, "zh-CN")
      case "recentlyAdded":
        return compareRecentlyAdded(left, right)
      case "title":
        return left.title.localeCompare(right.title, "zh-CN")
    }
    return 0
  })
}

export function useBooksForCollection({
  books,
  recentlyReadBooks,
  collectionId,
  query,
  sortBy,
  bookActiveFormatsById,
  bookDownloadStatusById,
  bookUploadStatusById,
  bookLocalOnlyById,
  favoriteBookIds,
}: SelectBooksForCollectionInput) {
  return useMemo(
    () =>
      selectBooksForCollection({
        books,
        recentlyReadBooks,
        collectionId,
        query,
        sortBy,
        bookActiveFormatsById,
        bookDownloadStatusById,
        bookUploadStatusById,
        bookLocalOnlyById,
        favoriteBookIds,
      }),
    [
      books,
      recentlyReadBooks,
      collectionId,
      query,
      sortBy,
      bookActiveFormatsById,
      bookDownloadStatusById,
      bookUploadStatusById,
      bookLocalOnlyById,
      favoriteBookIds,
    ],
  )
}
