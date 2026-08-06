import type { BookItem } from "@/src/domain/types"

import { selectBooksForCollection } from "./use-books-for-collection"

const books: BookItem[] = [
  { id: "1", title: "Alpha", author: "Zed", timestamp: "2026-01-01" },
  { id: "2", title: "Beta", author: "Yan", timestamp: "2026-03-01" },
  { id: "3", title: "Gamma", author: "Xia", timestamp: "2026-02-01" },
]

const commonInput = {
  books,
  recentlyReadBooks: [books[2]!, books[0]!],
  query: "",
  bookActiveFormatsById: new Map([["2", "EPUB"]]),
  bookDownloadStatusById: { "1": "downloaded", "2": "notDownloaded" },
  bookUploadStatusById: {
    "1": "uploadPending",
    "3": "uploading",
  },
  bookLocalOnlyById: { "1": true },
  favoriteBookIds: new Set(["1", "2"]),
}

describe("selectBooksForCollection", () => {
  it("should preserve recently-read order when that collection uses its default sort", () => {
    const result = selectBooksForCollection({
      ...commonInput,
      collectionId: "recentlyRead",
      sortBy: "recentlyRead",
    })

    expect(result.map((book) => book.id)).toEqual(["3", "1"])
  })

  it("should allow a locally readable book to belong to downloaded and local-only collections", () => {
    const downloaded = selectBooksForCollection({
      ...commonInput,
      collectionId: "downloaded",
      sortBy: "title",
    })
    const localOnly = selectBooksForCollection({
      ...commonInput,
      collectionId: "localOnly",
      sortBy: "title",
    })

    expect(downloaded.map((book) => book.id)).toEqual(["1"])
    expect(localOnly.map((book) => book.id)).toEqual(["1"])
  })

  it("should search only within the active collection", () => {
    const result = selectBooksForCollection({
      ...commonInput,
      collectionId: "favorites",
      query: "Gamma",
      sortBy: "title",
    })

    expect(result).toEqual([])
  })

  it("should include queued and active transfers in their respective collections", () => {
    const downloading = selectBooksForCollection({
      ...commonInput,
      collectionId: "downloading",
      sortBy: "title",
    })
    const uploading = selectBooksForCollection({
      ...commonInput,
      collectionId: "uploading",
      sortBy: "title",
    })

    expect(downloading.map((book) => book.id)).toEqual(["2"])
    expect(uploading.map((book) => book.id)).toEqual(["1", "3"])
  })
})
