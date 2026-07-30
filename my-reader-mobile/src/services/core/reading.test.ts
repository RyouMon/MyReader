jest.mock("@/modules/myreader-rust-components", () => ({
  __esModule: true,
  default: {
    listFavoriteBookIds: jest.fn(),
    setFavoriteBook: jest.fn(),
    getReadingPosition: jest.fn(),
    listReadingPositions: jest.fn(),
    setReadingPosition: jest.fn(),
    listReadingPositionCandidates: jest.fn(),
    selectReadingPositionCandidate: jest.fn(),
    listReaderBookmarks: jest.fn(),
    addReaderBookmark: jest.fn(),
    removeReaderBookmark: jest.fn(),
    listReaderAnnotations: jest.fn(),
    addReaderAnnotation: jest.fn(),
    updateReaderAnnotation: jest.fn(),
    removeReaderAnnotation: jest.fn(),
  },
}))

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

import type { Library } from "@my-reader/tools/types/library"
import MyReaderRustComponents from "@/modules/myreader-rust-components"
import {
  addReaderAnnotation,
  addReaderBookmark,
  getReadingPosition,
  listFavoriteBookIds,
  setFavoriteBook,
  setReadingPosition,
} from "./reading"

const library = { id: "library-1" } as Library

describe("core reading adapter", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(Date, "now").mockReturnValue(900)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it("should decode favorite IDs when core returns a projection", async () => {
    jest
      .mocked(MyReaderRustComponents.listFavoriteBookIds)
      .mockResolvedValue("[7,42]")

    await expect(listFavoriteBookIds(library)).resolves.toEqual([7, 42])
    expect(MyReaderRustComponents.listFavoriteBookIds).toHaveBeenCalledWith(
      "/sidecar",
    )
  })

  it("should pass both library roots when favorite state changes", async () => {
    jest
      .mocked(MyReaderRustComponents.setFavoriteBook)
      .mockResolvedValue(undefined)

    await setFavoriteBook(library, 42, true)

    expect(MyReaderRustComponents.setFavoriteBook).toHaveBeenCalledWith(
      "/sidecar",
      "/library",
      42,
      true,
      900,
    )
  })

  it("should decode position when core returns stored reading data", async () => {
    jest
      .mocked(MyReaderRustComponents.getReadingPosition)
      .mockResolvedValue(
        '{"bookId":42,"format":"EPUB","locator":{"href":"chapter.xhtml","type":"application/xhtml+xml"},"displayProgression":0.4,"updatedAt":900,"conflictCount":1}',
      )

    await expect(
      getReadingPosition(library, 42, "epub"),
    ).resolves.toMatchObject({
      bookId: 42,
      locator: { href: "chapter.xhtml" },
    })
  })

  it("should serialize locator when reading position changes", async () => {
    jest
      .mocked(MyReaderRustComponents.setReadingPosition)
      .mockResolvedValue(undefined)

    await setReadingPosition(
      library,
      42,
      "EPUB",
      { href: "chapter.xhtml", type: "application/xhtml+xml" },
      0.4,
    )

    expect(MyReaderRustComponents.setReadingPosition).toHaveBeenCalledWith(
      "/sidecar",
      "/library",
      42,
      "EPUB",
      '{"href":"chapter.xhtml","type":"application/xhtml+xml"}',
      0.4,
      900,
    )
  })

  it("should pass canonical bookmark fields when bookmark is added", async () => {
    jest
      .mocked(MyReaderRustComponents.addReaderBookmark)
      .mockResolvedValue(
        '{"id":"bookmark-1","bookId":42,"format":"EPUB","locatorKey":"chapter.xhtml","locator":{"href":"chapter.xhtml","type":"application/xhtml+xml"},"createdAt":900,"updatedAt":900}',
      )

    await expect(
      addReaderBookmark(library, 42, "EPUB", "chapter.xhtml", {
        href: "chapter.xhtml",
        type: "application/xhtml+xml",
      }),
    ).resolves.toMatchObject({ id: "bookmark-1", bookId: 42 })
    expect(MyReaderRustComponents.addReaderBookmark).toHaveBeenCalledWith(
      "/sidecar",
      "/library",
      42,
      "EPUB",
      "chapter.xhtml",
      '{"href":"chapter.xhtml","type":"application/xhtml+xml"}',
      900,
    )
  })

  it("should serialize selected text when annotation is added", async () => {
    jest
      .mocked(MyReaderRustComponents.addReaderAnnotation)
      .mockResolvedValue(
        '{"id":"annotation-1","bookId":42,"format":"EPUB","kind":"highlight","locator":{"href":"chapter.xhtml","type":"application/xhtml+xml","text":{"highlight":"Selected"}},"color":"yellow","note":null,"createdAt":900,"updatedAt":900}',
      )

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
    expect(MyReaderRustComponents.addReaderAnnotation).toHaveBeenCalledWith(
      "/sidecar",
      "/library",
      42,
      "EPUB",
      '{"href":"chapter.xhtml","type":"application/xhtml+xml","text":{"highlight":"Selected"}}',
      "yellow",
      null,
      900,
    )
  })
})
