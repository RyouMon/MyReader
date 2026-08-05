jest.mock("../fs/local-library-content", () => ({
  withLocalLibraryContentRoot: jest.fn(
    async (_library: unknown, operation: (root: string) => Promise<unknown>) =>
      operation("file:///library"),
  ),
}))

jest.mock("../fs/library-paths", () => ({
  librarySidecarRootUri: jest.fn(() => "file:///sidecar"),
}))

jest.mock("../fs/path", () => ({
  toNativeFilesystemPath: jest.fn((path: string) =>
    path.replace("file://", ""),
  ),
}))

jest.mock("./sync-events", () => ({
  announceLocalSidecarWork: jest.fn(),
}))

jest.mock("my-reader-core", () => ({
  readingAddAnnotation: jest.fn(),
  readingAddBookmark: jest.fn(),
  readingAddSessionInterval: jest.fn(),
  readingGetPosition: jest.fn(),
  readingGetStatistics: jest.fn(),
  readingListFavoriteBookIds: jest.fn(),
  readingSetFavoriteBook: jest.fn(),
  readingSetPosition: jest.fn(),
}))

import type { Library } from "@my-reader/tools/types/library"
import {
  readingAddAnnotation,
  readingAddBookmark,
  readingAddSessionInterval,
  readingGetPosition,
  readingGetStatistics,
  readingListFavoriteBookIds,
  readingSetFavoriteBook,
  readingSetPosition,
} from "my-reader-core"
import {
  addReaderAnnotation,
  addReaderBookmark,
  addReadingSessionInterval,
  getReadingPosition,
  getReadingStatistics,
  listFavoriteBookIds,
  setFavoriteBook,
  setReadingPosition,
} from "./reading"
import { announceLocalSidecarWork } from "./sync-events"

const library = { id: "library-1" } as Library

describe("core reading adapter", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(Date, "now").mockReturnValue(900)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it("should return favorite IDs when core returns a typed projection", async () => {
    jest.mocked(readingListFavoriteBookIds).mockResolvedValue([7, 42])

    await expect(listFavoriteBookIds(library)).resolves.toEqual([7, 42])
    expect(readingListFavoriteBookIds).toHaveBeenCalledWith("/sidecar")
  })

  it("should pass both library roots when favorite state changes", async () => {
    jest.mocked(readingSetFavoriteBook).mockResolvedValue()

    await setFavoriteBook(library, 42, true)

    expect(readingSetFavoriteBook).toHaveBeenCalledWith(
      "/sidecar",
      "/library",
      42,
      true,
      900,
    )
    expect(announceLocalSidecarWork).toHaveBeenCalledWith("library-1")
  })

  it("should not announce work when core mutation fails", async () => {
    jest
      .mocked(readingSetFavoriteBook)
      .mockRejectedValue(new Error("write failed"))

    await expect(setFavoriteBook(library, 42, true)).rejects.toThrow(
      "write failed",
    )

    expect(announceLocalSidecarWork).not.toHaveBeenCalled()
  })

  it("should return locator when core returns typed reading data", async () => {
    jest.mocked(readingGetPosition).mockResolvedValue({
      bookId: 42,
      format: "EPUB",
      locator: {
        href: "chapter.xhtml",
        type: "application/xhtml+xml",
      },
      displayProgression: 0.4,
      updatedAt: 900,
      conflictCount: 1,
    })

    await expect(
      getReadingPosition(library, 42, "epub"),
    ).resolves.toMatchObject({
      bookId: 42,
      locator: { href: "chapter.xhtml" },
    })
  })

  it("should pass typed locator when reading position changes", async () => {
    jest.mocked(readingSetPosition).mockResolvedValue()
    const locator = {
      href: "chapter.xhtml",
      type: "application/xhtml+xml",
    }

    await setReadingPosition(library, 42, "EPUB", locator, 0.4)

    expect(readingSetPosition).toHaveBeenCalledWith(
      "/sidecar",
      "/library",
      42,
      "EPUB",
      locator,
      0.4,
      900,
    )
  })

  it("should pass canonical bookmark fields when bookmark is added", async () => {
    jest.mocked(readingAddBookmark).mockResolvedValue({
      id: "bookmark-1",
      bookId: 42,
      format: "EPUB",
      locatorKey: "chapter.xhtml",
      locator: {
        href: "chapter.xhtml",
        type: "application/xhtml+xml",
      },
      createdAt: 900,
      updatedAt: 900,
    })
    const locator = {
      href: "chapter.xhtml",
      type: "application/xhtml+xml",
    }

    await expect(
      addReaderBookmark(library, 42, "EPUB", "chapter.xhtml", locator),
    ).resolves.toMatchObject({ id: "bookmark-1", bookId: 42 })
    expect(readingAddBookmark).toHaveBeenCalledWith(
      "/sidecar",
      "/library",
      42,
      "EPUB",
      "chapter.xhtml",
      locator,
      900,
    )
  })

  it("should pass selected text when annotation is added", async () => {
    jest.mocked(readingAddAnnotation).mockResolvedValue({
      id: "annotation-1",
      bookId: 42,
      format: "EPUB",
      kind: "highlight",
      locator: {
        href: "chapter.xhtml",
        type: "application/xhtml+xml",
        text: { highlight: "Selected" },
      },
      color: "yellow",
      createdAt: 900,
      updatedAt: 900,
    })
    const locator = {
      href: "chapter.xhtml",
      type: "application/xhtml+xml",
      text: { highlight: "Selected" },
    }

    await expect(
      addReaderAnnotation(library, 42, "EPUB", locator, "yellow", null),
    ).resolves.toMatchObject({ id: "annotation-1", kind: "highlight" })
    expect(readingAddAnnotation).toHaveBeenCalledWith(
      "/sidecar",
      "/library",
      42,
      "EPUB",
      locator,
      "yellow",
      undefined,
      900,
    )
  })

  it("should pass incremental duration when reading session is recorded", async () => {
    jest.mocked(readingAddSessionInterval).mockResolvedValue()

    await addReadingSessionInterval(library, {
      id: "11111111111141118111111111111111",
      bookId: 42,
      format: "EPUB",
      localDay: "2026-07-28",
      startedAt: 600,
      durationSeconds: 30,
      updatedAt: 900,
    })

    expect(readingAddSessionInterval).toHaveBeenCalledWith(
      "/sidecar",
      "/library",
      "11111111111141118111111111111111",
      42,
      "EPUB",
      "2026-07-28",
      600,
      30,
      900,
    )
  })

  it("should provide library root when statistics are read", async () => {
    jest.mocked(readingGetStatistics).mockResolvedValue({
      days: [{ day: "2026-07-28", durationSeconds: 30 }],
      totalDurationSeconds: 30,
      longestStreakDays: 1,
      completedBooks: 1,
    })

    await expect(
      getReadingStatistics(library, "2026-01-01", "2026-12-31"),
    ).resolves.toMatchObject({
      days: { "2026-07-28": 30 },
      completedBooks: 1,
    })

    expect(readingGetStatistics).toHaveBeenCalledWith(
      "/sidecar",
      "/library",
      "2026-01-01",
      "2026-12-31",
    )
  })
})
