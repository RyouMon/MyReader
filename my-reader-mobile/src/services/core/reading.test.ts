jest.mock("@/src/domain/library/local-library-content", () => ({
  withLocalLibraryCalibreRoot: jest.fn(
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

jest.mock("./transport", () => ({
  invokeCoreAsync: jest.fn(),
}))

import type { Library } from "@my-reader/tools/types/library"
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
import { invokeCoreAsync } from "./transport"

const library = { id: "library-1" } as Library

describe("core reading adapter", () => {
  const mockInvokeCoreAsync = jest.mocked(invokeCoreAsync)

  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(Date, "now").mockReturnValue(900)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it("should return favorite IDs when core returns a typed projection", async () => {
    mockInvokeCoreAsync.mockResolvedValue([7, 42])

    await expect(listFavoriteBookIds(library)).resolves.toEqual([7, 42])
    expect(mockInvokeCoreAsync).toHaveBeenCalledWith(
      "reading",
      "listFavoriteBookIds",
      {
        sidecarRootPath: "/sidecar",
      },
    )
  })

  it("should pass both library roots when favorite state changes", async () => {
    mockInvokeCoreAsync.mockResolvedValue(null)

    await setFavoriteBook(library, 42, true)

    expect(mockInvokeCoreAsync).toHaveBeenCalledWith(
      "reading",
      "setFavoriteBook",
      {
        sidecarRootPath: "/sidecar",
        libraryRootPath: "/library",
        bookId: 42,
        isFavorite: true,
        recordedAtMs: 900,
      },
    )
    expect(announceLocalSidecarWork).toHaveBeenCalledWith("library-1")
  })

  it("should not announce work when core mutation fails", async () => {
    mockInvokeCoreAsync.mockRejectedValue(new Error("write failed"))

    await expect(setFavoriteBook(library, 42, true)).rejects.toThrow(
      "write failed",
    )

    expect(announceLocalSidecarWork).not.toHaveBeenCalled()
  })

  it("should return locator when core returns typed reading data", async () => {
    mockInvokeCoreAsync.mockResolvedValue({
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
    mockInvokeCoreAsync.mockResolvedValue(null)

    await setReadingPosition(
      library,
      42,
      "EPUB",
      { href: "chapter.xhtml", type: "application/xhtml+xml" },
      0.4,
    )

    expect(mockInvokeCoreAsync).toHaveBeenCalledWith(
      "reading",
      "setReadingPosition",
      {
        sidecarRootPath: "/sidecar",
        libraryRootPath: "/library",
        bookId: 42,
        format: "EPUB",
        locator: {
          href: "chapter.xhtml",
          type: "application/xhtml+xml",
        },
        displayProgression: 0.4,
        recordedAtMs: 900,
      },
    )
  })

  it("should pass canonical bookmark fields when bookmark is added", async () => {
    mockInvokeCoreAsync.mockResolvedValue({
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

    await expect(
      addReaderBookmark(library, 42, "EPUB", "chapter.xhtml", {
        href: "chapter.xhtml",
        type: "application/xhtml+xml",
      }),
    ).resolves.toMatchObject({ id: "bookmark-1", bookId: 42 })
    expect(mockInvokeCoreAsync).toHaveBeenCalledWith(
      "reading",
      "addReaderBookmark",
      {
        sidecarRootPath: "/sidecar",
        libraryRootPath: "/library",
        bookId: 42,
        format: "EPUB",
        locatorKey: "chapter.xhtml",
        locator: {
          href: "chapter.xhtml",
          type: "application/xhtml+xml",
        },
        recordedAtMs: 900,
      },
    )
  })

  it("should pass selected text when annotation is added", async () => {
    mockInvokeCoreAsync.mockResolvedValue({
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
      note: null,
      createdAt: 900,
      updatedAt: 900,
    })

    await expect(
      addReaderAnnotation(
        library,
        42,
        "EPUB",
        {
          href: "chapter.xhtml",
          type: "application/xhtml+xml",
          text: { highlight: "Selected" },
        },
        "yellow",
        null,
      ),
    ).resolves.toMatchObject({ id: "annotation-1", kind: "highlight" })
    expect(mockInvokeCoreAsync).toHaveBeenCalledWith(
      "reading",
      "addReaderAnnotation",
      {
        sidecarRootPath: "/sidecar",
        libraryRootPath: "/library",
        bookId: 42,
        format: "EPUB",
        locator: {
          href: "chapter.xhtml",
          type: "application/xhtml+xml",
          text: { highlight: "Selected" },
        },
        color: "yellow",
        note: null,
        recordedAtMs: 900,
      },
    )
  })

  it("should pass incremental duration when reading session is recorded", async () => {
    mockInvokeCoreAsync.mockResolvedValue(null)

    await addReadingSessionInterval(library, {
      id: "11111111111141118111111111111111",
      bookId: 42,
      format: "EPUB",
      localDay: "2026-07-28",
      startedAt: 600,
      durationSeconds: 30,
      updatedAt: 900,
    })

    expect(mockInvokeCoreAsync).toHaveBeenCalledWith(
      "reading",
      "addReadingSessionInterval",
      {
        sidecarRootPath: "/sidecar",
        libraryRootPath: "/library",
        id: "11111111111141118111111111111111",
        bookId: 42,
        format: "EPUB",
        localDay: "2026-07-28",
        startedAtMs: 600,
        durationSeconds: 30,
        recordedAtMs: 900,
      },
    )
  })

  it("should provide library root when statistics are read", async () => {
    mockInvokeCoreAsync.mockResolvedValue({
      days: {},
      totalDurationSeconds: 0,
      longestStreakDays: 0,
      completedBooks: 1,
    })

    await expect(
      getReadingStatistics(library, "2026-01-01", "2026-12-31"),
    ).resolves.toMatchObject({ completedBooks: 1 })

    expect(mockInvokeCoreAsync).toHaveBeenCalledWith(
      "reading",
      "getReadingStatistics",
      {
        sidecarRootPath: "/sidecar",
        libraryRootPath: "/library",
        startDay: "2026-01-01",
        endDay: "2026-12-31",
      },
    )
  })
})
