import type { CalibreBook } from "@my-reader/tools/types/book"
import { describe, expect, it } from "vitest"
import { selectBooksForSpecialCollection } from "../bookCollections"

function makeBook(
  id: number,
  overrides: Partial<CalibreBook> = {},
): CalibreBook {
  return {
    id,
    title: `Book ${id}`,
    authorSort: `Author ${id}`,
    authors: [`Author ${id}`],
    tags: [],
    series: null,
    seriesIndex: null,
    formats: ["EPUB"],
    readableFormats: ["EPUB"],
    preferredFormat: "EPUB",
    hasCover: false,
    path: `Author ${id}/Book ${id}`,
    timestamp: `2026-01-0${id}T00:00:00Z`,
    pubdate: null,
    lastModified: null,
    comment: null,
    publisher: null,
    languages: [],
    rating: null,
    uuid: `uuid-${id}`,
    ...overrides,
  }
}

const baseInput = {
  fileStates: [],
  downloadQueue: [],
  pendingUploadBookUuids: [],
  selectedFormatById: {},
  isRemoteLibrary: true,
  query: "",
  sortBy: "title" as const,
}

describe("special book collections", () => {
  it("should classify downloaded books by their effective reading format", () => {
    const books = [
      makeBook(1, {
        formats: ["EPUB", "PDF"],
        readableFormats: ["EPUB", "PDF"],
      }),
      makeBook(2),
    ]

    const result = selectBooksForSpecialCollection({
      ...baseInput,
      books,
      collectionId: "downloaded",
      selectedFormatById: { "1": "PDF" },
      fileStates: [
        { bookId: 1, format: "EPUB", localState: "present" },
        { bookId: 1, format: "PDF", localState: "remote_only" },
        { bookId: 2, format: "EPUB", localState: "present" },
      ],
    })

    expect(result.map((book) => book.id)).toEqual([2])
  })

  it("should allow a pending local upload to appear in downloaded and local-only", () => {
    const books = [makeBook(1)]
    const input = {
      ...baseInput,
      books,
      fileStates: [{ bookId: 1, format: "EPUB", localState: "dirty_push" }],
    }

    expect(
      selectBooksForSpecialCollection({
        ...input,
        collectionId: "downloaded",
      }).map((book) => book.id),
    ).toEqual([1])
    expect(
      selectBooksForSpecialCollection({
        ...input,
        collectionId: "localOnly",
      }).map((book) => book.id),
    ).toEqual([1])
  })

  it("should project active downloads and pending uploads by book identity", () => {
    const books = [makeBook(1), makeBook(2), makeBook(3)]

    expect(
      selectBooksForSpecialCollection({
        ...baseInput,
        books,
        collectionId: "downloading",
        downloadQueue: [
          { bookId: 2, format: "EPUB" },
          { bookId: 2, format: "PDF" },
        ],
      }).map((book) => book.id),
    ).toEqual([2])
    expect(
      selectBooksForSpecialCollection({
        ...baseInput,
        books,
        collectionId: "uploading",
        pendingUploadBookUuids: ["uuid-1", "uuid-3"],
      }).map((book) => book.id),
    ).toEqual([1, 3])
  })

  it("should apply search and the selected ordering after collection filtering", () => {
    const books = [
      makeBook(1, { title: "Zeta", authorSort: "Able" }),
      makeBook(2, { title: "Alpha", authorSort: "Zulu", tags: ["Focus"] }),
    ]

    const result = selectBooksForSpecialCollection({
      ...baseInput,
      books,
      collectionId: "downloading",
      downloadQueue: books.map((book) => ({
        bookId: book.id,
        format: "EPUB",
      })),
      query: "focus",
      sortBy: "author",
    })

    expect(result.map((book) => book.id)).toEqual([2])
  })
})
