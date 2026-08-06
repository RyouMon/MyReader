jest.mock("../fs/path", () => ({
  toNativeFilesystemPath: (uri: string) => uri.replace("file://", ""),
}))
jest.mock("expo-file-system", () => ({
  File: jest.fn(() => ({ uri: "file:///documents/config.json" })),
  Paths: { document: "file:///documents" },
}))
jest.mock("./sync-events", () => ({
  announceLocalSidecarWork: jest.fn(),
}))
jest.mock("../query/invalidate-table", () => ({
  cacheFileState: jest.fn(),
}))
jest.mock("my-reader-core", () => ({
  catalogImportLocalBook: jest.fn(),
  catalogStageRemoteBookImport: jest.fn(),
  catalogGetBookFormat: jest.fn(),
  catalogGetLibraryBookFormat: jest.fn(),
  catalogGetBookDetail: jest.fn(),
  catalogListLibraryBooks: jest.fn(),
  catalogListBookFormats: jest.fn(),
  catalogListBookSummaries: jest.fn(),
  catalogListBooksPageByLastRead: jest.fn(),
  contentGetFileState: jest.fn(),
}))

import {
  catalogImportLocalBook,
  catalogStageRemoteBookImport,
  catalogGetBookDetail,
  catalogGetBookFormat,
  catalogGetLibraryBookFormat,
  catalogListBookFormats,
  catalogListBookSummaries,
  catalogListBooksPageByLastRead,
  catalogListLibraryBooks,
  contentGetFileState,
} from "my-reader-core"
import {
  getCalibreBookDetail,
  getCalibreBookFormat,
  importLocalBook,
  importRemoteBook,
  listCalibreBookFormats,
  listCalibreBookSummaries,
  listCalibreBooksPageByLastRead,
  listLibraryBooks,
} from "./catalog"
import { cacheFileState } from "../query/invalidate-table"
import { announceLocalSidecarWork } from "./sync-events"

describe("core catalog adapter", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("should return book detail when core returns a typed catalog record", async () => {
    jest.mocked(catalogGetBookDetail).mockResolvedValue({
      id: 42,
      title: "The Left Hand of Darkness",
      titleSort: "Left Hand of Darkness, The",
      authorSort: "Le Guin, Ursula K.",
      authors: ["Ursula K. Le Guin"],
      tags: [],
      formats: ["EPUB"],
      readableFormats: ["EPUB"],
      hasCover: true,
      path: "Ursula K. Le Guin/The Left Hand of Darkness",
      languages: [],
      formatSizes: [{ format: "EPUB", sizeBytes: 1024 }],
      identifiers: [],
    })

    const detail = await getCalibreBookDetail("file:///library", 42)

    expect(catalogGetBookDetail).toHaveBeenCalledWith("/library", 42)
    expect(detail.series).toBeNull()
    expect(detail.preferredFormat).toBeNull()
    expect(detail.titleSort).toBe("Left Hand of Darkness, The")
    expect(detail.formatSizes).toEqual([{ format: "EPUB", sizeBytes: 1024 }])
  })

  it("should preserve relative file path when core returns book formats", async () => {
    jest.mocked(catalogListBookFormats).mockResolvedValue([
      {
        format: "EPUB",
        name: "The Left Hand of Darkness",
        sizeBytes: 1024,
        relativePath:
          "Ursula K. Le Guin/The Left Hand of Darkness/The Left Hand of Darkness.epub",
      },
    ])

    const formats = await listCalibreBookFormats("file:///library", 42)

    expect(formats[0]?.relativePath).toBe(
      "Ursula K. Le Guin/The Left Hand of Darkness/The Left Hand of Darkness.epub",
    )
  })

  it("should delegate single format resolution when one format is requested", async () => {
    jest.mocked(catalogGetBookFormat).mockResolvedValue({
      format: "EPUB",
      name: "The Left Hand of Darkness",
      sizeBytes: 1024,
      relativePath:
        "Ursula K. Le Guin/The Left Hand of Darkness/The Left Hand of Darkness.epub",
    })

    const format = await getCalibreBookFormat("file:///library", 42, "epub")

    expect(catalogGetBookFormat).toHaveBeenCalledWith("/library", 42, "epub")
    expect(format?.format).toBe("EPUB")
  })

  it("should preserve format paths when core returns book summaries", async () => {
    jest.mocked(catalogListBookSummaries).mockResolvedValue([
      {
        id: 42,
        path: "Ursula K. Le Guin/The Left Hand of Darkness",
        hasCover: true,
        formats: ["EPUB"],
        readableFormats: ["EPUB"],
        preferredFormat: "EPUB",
        formatPaths: [
          "Ursula K. Le Guin/The Left Hand of Darkness/The Left Hand of Darkness.epub",
        ],
      },
    ])

    const summaries = await listCalibreBookSummaries("file:///library")

    expect(summaries[0]?.formatPaths).toEqual([
      "Ursula K. Le Guin/The Left Hand of Darkness/The Left Hand of Darkness.epub",
    ])
  })

  it("should delegate recent-book ordering when last-read page is requested", async () => {
    jest
      .mocked(catalogListBooksPageByLastRead)
      .mockResolvedValue({ items: [], total: 0 })

    await listCalibreBooksPageByLastRead(
      "file:///library",
      "file:///sidecar",
      0,
      20,
      "Earthsea",
    )

    expect(catalogListBooksPageByLastRead).toHaveBeenCalledWith(
      "/library",
      "/sidecar",
      0,
      20,
      "Earthsea",
    )
  })

  it("should pass registered library identity with distinct content and sidecar roots", async () => {
    jest.mocked(catalogListLibraryBooks).mockResolvedValue([])
    const library = {
      id: "library-1",
      name: "Library",
      path: "file:///library",
      bookCount: 0,
      libraryType: "myreader" as const,
    }

    await listLibraryBooks(
      library,
      "file:///library",
      "file:///documents/libraries/library-1",
    )

    expect(catalogListLibraryBooks).toHaveBeenCalledWith(
      "/documents/config.json",
      "library-1",
      "/documents/libraries/library-1",
      "/library",
    )
  })

  it("should announce sync work only after a local book import succeeds", async () => {
    const book = {
      id: 42,
      title: "Earthsea",
      titleSort: "Earthsea",
      authorSort: "Le Guin",
      authors: ["Ursula K. Le Guin"],
      tags: [],
      formats: ["EPUB"],
      readableFormats: ["EPUB"],
      hasCover: false,
      path: "Books/uuid",
      languages: [],
    }
    jest.mocked(catalogImportLocalBook).mockResolvedValue(book)
    jest.spyOn(Date, "now").mockReturnValueOnce(123)
    const library = {
      id: "library-1",
      name: "Library",
      path: "file:///library",
      bookCount: 0,
      libraryType: "myreader" as const,
    }

    await importLocalBook(
      library,
      "file:///library",
      "file:///documents/libraries/library-1",
      {
        sourceFileUri: "file:///inbox/Earthsea.epub",
        sourceFileName: "Earthsea.epub",
        authors: ["Ursula K. Le Guin"],
        consumeSourceFile: true,
      },
    )

    expect(catalogImportLocalBook).toHaveBeenCalledWith(
      "/documents/config.json",
      "library-1",
      "/documents/libraries/library-1",
      "/library",
      {
        sourceFilePath: "/inbox/Earthsea.epub",
        sourceFileName: "Earthsea.epub",
        title: undefined,
        authors: ["Ursula K. Le Guin"],
        recordedAtMs: 123,
        consumeSourceFile: true,
      },
    )
    expect(announceLocalSidecarWork).toHaveBeenCalledWith("library-1")
  })

  it("should stage a remote book locally before requesting its background upload", async () => {
    const book = {
      id: 42,
      title: "Earthsea",
      titleSort: "Earthsea",
      authorSort: "Le Guin",
      authors: ["Ursula K. Le Guin"],
      tags: [],
      formats: ["EPUB"],
      readableFormats: ["EPUB"],
      hasCover: false,
      path: "Books/uuid",
      languages: [],
    }
    jest.mocked(catalogStageRemoteBookImport).mockResolvedValue(book)
    jest.mocked(catalogGetLibraryBookFormat).mockResolvedValue({
      format: "EPUB",
      name: "Earthsea",
      sizeBytes: 1024,
      relativePath: "Books/Earthsea (018f2f)/Earthsea.epub",
    })
    jest.mocked(contentGetFileState).mockResolvedValue({
      id: "state-1",
      path: "Books/Earthsea (018f2f)/Earthsea.epub",
      localState: "dirty_push",
      isLocallyAvailable: true,
      updatedAt: 123,
    })
    jest.spyOn(Date, "now").mockReturnValueOnce(123)
    const library = {
      id: "library-1",
      name: "Library",
      path: "file:///library",
      bookCount: 0,
      libraryType: "myreader" as const,
    }

    await expect(
      importRemoteBook(
        library,
        "file:///library",
        "file:///documents/libraries/library-1",
        {
          sourceFileUri: "file:///inbox/Earthsea.epub",
          sourceFileName: "Earthsea.epub",
          authors: ["Ursula K. Le Guin"],
          consumeSourceFile: true,
        },
      ),
    ).resolves.toEqual(expect.objectContaining({ id: 42 }))

    expect(catalogStageRemoteBookImport).toHaveBeenCalledWith(
      "/documents/config.json",
      "library-1",
      "/documents/libraries/library-1",
      "/library",
      {
        sourceFilePath: "/inbox/Earthsea.epub",
        sourceFileName: "Earthsea.epub",
        title: undefined,
        authors: ["Ursula K. Le Guin"],
        recordedAtMs: 123,
        consumeSourceFile: true,
      },
    )
    expect(contentGetFileState).toHaveBeenCalledWith(
      "/documents/libraries/library-1",
      "Books/Earthsea (018f2f)/Earthsea.epub",
    )
    expect(cacheFileState).toHaveBeenCalledWith(
      "library-1",
      expect.objectContaining({
        isLocallyAvailable: true,
        localState: "dirty_push",
        path: "Books/Earthsea (018f2f)/Earthsea.epub",
      }),
    )
    expect(announceLocalSidecarWork).not.toHaveBeenCalled()
  })
})
