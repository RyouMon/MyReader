import type { BookItem } from "@/src/domain/types"

import { buildLibraryBookCellMetaById } from "./library-book-cell-meta"

const translate = (key: string, options?: { title: string }) =>
  options?.title ? `${key}:${options.title}` : key

function makeBook(overrides: Partial<BookItem> = {}): BookItem {
  return {
    id: "book-1",
    title: "Clean Architecture",
    author: "Robert C. Martin",
    formats: ["epub"],
    ...overrides,
  }
}

describe("buildLibraryBookCellMetaById", () => {
  it("should precompute labels, menu actions, progress and remote download subscription when building library book cell metadata", () => {
    const metaById = buildLibraryBookCellMetaById({
      bookActiveFormatsById: new Map([["book-1", "PDF"]]),
      bookDownloadStatusById: { "book-1": "downloading" },
      bookFormatMetaById: new Map([["book-1", { effectiveFormat: "EPUB" }]]),
      bookFormatsById: { "book-1": ["EPUB", "PDF"] },
      favoriteSet: new Set(["book-1"]),
      isRemote: true,
      progressByBookId: { "book-1": { EPUB: 42 } },
      selectedFormatById: { "book-1": "epub" },
      selectedLibraryId: "library-1",
      translate,
      visibleBooks: [makeBook()],
    })

    const meta = metaById.get("book-1")

    expect(meta?.downloadStatus).toBe("downloading")
    expect(meta?.progress).toEqual({ percent: 42 })
    expect(meta?.readerFormat).toBe("EPUB")
    expect(meta?.subscriptionLibraryId).toBe("library-1")
    expect(meta?.subscriptionFormat).toBe("EPUB")
    expect(meta?.moreActionsLabel).toBe(
      "bookDetail.moreActions:Clean Architecture",
    )
    expect(meta?.openBookLabel).toBe("bookDetail.openBook:Clean Architecture")
    const actionIds = meta?.menuActions.map((action) => action.id)
    expect(actionIds).toEqual([
      "detail",
      "favorite",
      "share",
      "cancelDownload",
      "setDefaultFormat",
    ])
    expect(
      meta?.menuActions.find((action) => action.id === "favorite")?.title,
    ).toBe("Remove from Favorites")
  })

  it("should use active download format when no reader format is resolved yet", () => {
    const metaById = buildLibraryBookCellMetaById({
      bookActiveFormatsById: new Map([["book-1", "PDF"]]),
      bookDownloadStatusById: { "book-1": "downloading" },
      bookFormatMetaById: new Map([["book-1", {}]]),
      bookFormatsById: { "book-1": ["PDF"] },
      favoriteSet: new Set(),
      isRemote: true,
      selectedFormatById: {},
      selectedLibraryId: "library-1",
      translate,
      visibleBooks: [makeBook({ formats: ["pdf"] })],
    })

    const meta = metaById.get("book-1")

    expect(meta?.readerFormat).toBeUndefined()
    expect(meta?.subscriptionLibraryId).toBe("library-1")
    expect(meta?.subscriptionFormat).toBe("PDF")
    expect(meta?.progress).toBeUndefined()
  })

  it("should not subscribe local books to download progress when building library book cell metadata", () => {
    const metaById = buildLibraryBookCellMetaById({
      bookActiveFormatsById: new Map([["book-1", "EPUB"]]),
      bookDownloadStatusById: { "book-1": "downloading" },
      bookFormatMetaById: new Map([["book-1", { effectiveFormat: "EPUB" }]]),
      bookFormatsById: { "book-1": ["EPUB"] },
      favoriteSet: new Set(),
      isRemote: false,
      selectedFormatById: {},
      selectedLibraryId: "library-1",
      translate,
      visibleBooks: [makeBook()],
    })

    const meta = metaById.get("book-1")

    expect(meta?.subscriptionLibraryId).toBeUndefined()
    expect(meta?.subscriptionFormat).toBeUndefined()
  })

  it("should normalize unknown statuses and only builds metadata for visible books when building library book cell metadata", () => {
    const metaById = buildLibraryBookCellMetaById({
      bookActiveFormatsById: new Map(),
      bookDownloadStatusById: {
        "book-1": "unexpected",
        "book-2": "downloaded",
      },
      bookFormatMetaById: new Map(),
      bookFormatsById: {},
      favoriteSet: new Set(),
      isRemote: true,
      selectedFormatById: {},
      translate,
      visibleBooks: [makeBook()],
    })

    expect(metaById.size).toBe(1)
    expect(metaById.has("book-2")).toBe(false)
    expect(metaById.get("book-1")?.downloadStatus).toBe("notDownloaded")
  })
})
