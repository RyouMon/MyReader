import { readerBookmarkLocatorKey } from "@my-reader/tools/reader-bookmarks"
import type { ReaderLocator } from "@my-reader/tools/reader-toc"
import {
  addReaderBookmark as addCoreReaderBookmark,
  listReaderBookmarks as listCoreReaderBookmarks,
  removeReaderBookmark as removeCoreReaderBookmark,
} from "@/src/services/core/reading"
import type { Library } from "../types"
import {
  addReaderBookmark,
  listReaderBookmarks,
  removeReaderBookmark,
} from "./reader-bookmarks"

jest.mock("@/src/services/core/reading", () => ({
  addReaderBookmark: jest.fn(),
  listReaderBookmarks: jest.fn(),
  removeReaderBookmark: jest.fn(),
}))

jest.mock("@/src/utils/common", () => ({
  uuid: jest.fn(() => "bookmark-id"),
}))

const library = { id: "library-1" } as Library

function locator(position: number, href = "OPS/chapter.xhtml"): ReaderLocator {
  return {
    href,
    type: "application/xhtml+xml",
    locations: { position, progression: 0 },
  }
}

function row(overrides: Record<string, unknown> = {}) {
  const itemLocator = locator(2)
  return {
    id: "existing-id",
    bookId: 7,
    format: "EPUB",
    locatorKey: readerBookmarkLocatorKey(itemLocator),
    locator: itemLocator,
    createdAt: 10,
    updatedAt: 20,
    ...overrides,
  }
}

describe("reader bookmarks domain", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest
      .mocked(addCoreReaderBookmark)
      .mockImplementation(
        async (_library, bookId, format, locatorKey, value) => ({
          id: "bookmark-id",
          bookId,
          format,
          locatorKey,
          locator: value,
          createdAt: 100,
          updatedAt: 100,
        }),
      )
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it("should create a canonical bookmark when the location is new", async () => {
    const bookmark = await addReaderBookmark(
      library,
      7,
      "epub",
      locator(2, "OPS/chapter.xhtml#section"),
    )

    expect(bookmark).toMatchObject({
      id: "bookmark-id",
      format: "EPUB",
      locatorKey: readerBookmarkLocatorKey(
        locator(2, "OPS/chapter.xhtml#section"),
      ),
      locator: {
        href: "OPS/chapter.xhtml",
        locations: { fragments: ["section"] },
      },
    })
    expect(addCoreReaderBookmark).toHaveBeenCalledWith(
      library,
      7,
      "EPUB",
      readerBookmarkLocatorKey(locator(2, "OPS/chapter.xhtml#section")),
      expect.objectContaining({
        href: "OPS/chapter.xhtml",
      }),
    )
  })

  it("should reuse an active bookmark when the natural key exists", async () => {
    jest.mocked(addCoreReaderBookmark).mockResolvedValue(row())

    const bookmark = await addReaderBookmark(library, 7, "EPUB", locator(2))

    expect(bookmark.id).toBe("existing-id")
  })

  it("should revive bookmark identity when the natural key is tombstoned", async () => {
    jest.mocked(addCoreReaderBookmark).mockResolvedValue(row({ updatedAt: 31 }))

    const bookmark = await addReaderBookmark(library, 7, "EPUB", locator(2))

    expect(bookmark.id).toBe("existing-id")
    expect(bookmark.updatedAt).toBe(31)
  })

  it("should list active bookmarks in reading order when rows are unsorted", async () => {
    jest.mocked(listCoreReaderBookmarks).mockResolvedValue([
      row({
        id: "third",
        locatorKey: readerBookmarkLocatorKey(locator(3)),
        locator: locator(3),
      }),
      row({
        id: "first",
        locatorKey: readerBookmarkLocatorKey(locator(1)),
        locator: locator(1),
      }),
    ])

    const bookmarks = await listReaderBookmarks(library, 7, "EPUB")

    expect(bookmarks.map((bookmark) => bookmark.id)).toEqual(["first", "third"])
  })

  it("should tombstone an active bookmark when removing it", async () => {
    jest.mocked(removeCoreReaderBookmark).mockResolvedValue(undefined)

    await removeReaderBookmark(library, 7, "epub", locator(2))

    expect(removeCoreReaderBookmark).toHaveBeenCalledWith(
      library,
      7,
      "EPUB",
      readerBookmarkLocatorKey(locator(2)),
    )
  })

  it("should accept an atomic no-op when the bookmark is already deleted", async () => {
    jest.mocked(removeCoreReaderBookmark).mockResolvedValue(undefined)

    await removeReaderBookmark(library, 7, "EPUB", locator(2))

    expect(removeCoreReaderBookmark).toHaveBeenCalledTimes(1)
  })
})
