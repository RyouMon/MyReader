jest.mock("../fs/path", () => ({
  toNativeFilesystemPath: (uri: string) => uri.replace("file://", ""),
}))
jest.mock("../fs/library-paths", () => ({
  librarySidecarRootUri: () => "file:///sidecar",
}))
jest.mock("../fs/local-library-content", () => ({
  withLocalLibraryContentRoot: (
    _library: unknown,
    operation: (root: string) => unknown,
  ) => operation("file:///library"),
}))
jest.mock("../query/invalidate-table", () => ({
  invalidateBookReadingFormat: jest.fn(),
  invalidateFileStates: jest.fn(),
}))
jest.mock("my-reader-core", () => ({
  contentFinalizeDownloadedFile: jest.fn(),
  contentInstallVerifiedDownloadedFile: jest.fn(),
  contentListCoverThumbnailCache: jest.fn(),
  contentListReadingFormats: jest.fn(),
  contentMarkFileSourceMissing: jest.fn(),
  contentSetReadingFormat: jest.fn(),
  contentUpsertCoverThumbnailCache: jest.fn(),
  contentUpsertFileState: jest.fn(),
}))

import type { Library } from "@my-reader/tools/types/library"
import {
  contentFinalizeDownloadedFile,
  contentInstallVerifiedDownloadedFile,
  contentListCoverThumbnailCache,
  contentListReadingFormats,
  contentMarkFileSourceMissing,
  contentSetReadingFormat,
  contentUpsertCoverThumbnailCache,
  contentUpsertFileState,
} from "my-reader-core"
import {
  finalizeDownloadedFile,
  installVerifiedDownloadedFile,
  listBookCoverThumbnailCache,
  listBookReadingFormats,
  markFileSourceMissing,
  setBookReadingFormat,
  upsertBookCoverThumbnailCache,
  upsertFileState,
} from "./content"

const library = { id: "library-1" } as Library

describe("core content adapter", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("should return reading formats when core returns typed entries", async () => {
    jest
      .mocked(contentListReadingFormats)
      .mockResolvedValue([{ bookId: "42", format: "PDF" }])

    await expect(listBookReadingFormats(library)).resolves.toEqual({
      "42": "PDF",
    })
    expect(contentListReadingFormats).toHaveBeenCalledWith(
      "/sidecar",
      "/library",
    )
  })

  it("should send absence when reading format is cleared", async () => {
    jest.mocked(contentSetReadingFormat).mockResolvedValue()

    await setBookReadingFormat(library, 42, null)

    expect(contentSetReadingFormat).toHaveBeenCalledWith(
      "/sidecar",
      "/library",
      42,
      undefined,
    )
  })

  it("should pass typed file state update when download completes", async () => {
    jest.mocked(contentUpsertFileState).mockResolvedValue()

    await upsertFileState(library, "Author/Book/Book.epub", {
      localState: "present",
      localSize: 1024,
    })

    expect(contentUpsertFileState).toHaveBeenCalledWith(
      "/sidecar",
      "Author/Book/Book.epub",
      {
        localState: "present",
        localSha256: undefined,
        localSize: 1024,
        localMtime: undefined,
      },
    )
  })

  it("should delegate final state commit when downloaded file is finalized", async () => {
    jest.mocked(contentFinalizeDownloadedFile).mockResolvedValue({
      size: 1024,
      sha256: "ab".repeat(32),
      mtimeMs: 2000,
    })

    await expect(
      finalizeDownloadedFile(
        library,
        "Author/Book/Book.epub",
        "file:///library/Author/Book/Book.epub",
      ),
    ).resolves.toEqual({
      size: 1024,
      sha256: "ab".repeat(32),
      mtimeMs: 2000,
    })

    expect(contentFinalizeDownloadedFile).toHaveBeenCalledWith(
      "/sidecar",
      "Author/Book/Book.epub",
      "/library/Author/Book/Book.epub",
    )
  })

  it("should install a managed download only after core verification", async () => {
    jest.mocked(contentInstallVerifiedDownloadedFile).mockResolvedValue({
      size: 1024,
      sha256: "ab".repeat(32),
      mtimeMs: 2000,
    })

    await installVerifiedDownloadedFile(
      library,
      "Books/book/book.epub",
      "file:///library/Books/book/book.epub.part",
      "file:///library/Books/book/book.epub",
      1024,
      "ab".repeat(32),
    )

    expect(contentInstallVerifiedDownloadedFile).toHaveBeenCalledWith(
      "/sidecar",
      "Books/book/book.epub",
      "/library/Books/book/book.epub.part",
      "/library/Books/book/book.epub",
      1024,
      "ab".repeat(32),
    )
  })

  it("should preserve a missing remote source state", async () => {
    jest.mocked(contentMarkFileSourceMissing).mockResolvedValue()

    await markFileSourceMissing(library, "Books/book/book.epub")

    expect(contentMarkFileSourceMissing).toHaveBeenCalledWith(
      "/sidecar",
      "Books/book/book.epub",
    )
  })

  it("should delegate cover manifest persistence when thumbnail is generated", async () => {
    jest.mocked(contentUpsertCoverThumbnailCache).mockResolvedValue()
    const patch = {
      bookId: 42,
      coverIdentity: "cover-v2",
      thumbnailVersion: "v3",
      widthPx: 180,
      heightPx: 270,
      fileName: "42.jpg",
      fileSizeBytes: 2048,
    }

    await upsertBookCoverThumbnailCache(library, patch)

    expect(contentUpsertCoverThumbnailCache).toHaveBeenCalledWith(
      "/sidecar",
      patch,
    )
  })

  it("should return cover manifest rows when typed cache is loaded", async () => {
    const rows = [
      {
        id: "cache-1",
        bookId: 42,
        coverIdentity: "cover-v2",
        thumbnailVersion: "v3",
        widthPx: 180,
        heightPx: 270,
        fileName: "42.jpg",
        fileSizeBytes: 2048,
        createdAt: 1000,
        updatedAt: 1000,
      },
    ]
    jest.mocked(contentListCoverThumbnailCache).mockResolvedValue(rows)

    await expect(
      listBookCoverThumbnailCache(library, {
        thumbnailVersion: "v3",
        widthPx: 180,
        heightPx: 270,
      }),
    ).resolves.toEqual(rows)
  })
})
