jest.mock("../fs/path", () => ({
  toNativeFilesystemPath: (uri: string) => uri.replace("file://", ""),
}))
jest.mock("../fs/library-paths", () => ({
  librarySidecarRootUri: () => "file:///sidecar",
}))
jest.mock("@/src/domain/library/local-library-content", () => ({
  withLocalLibraryCalibreRoot: (
    _library: unknown,
    operation: (root: string) => unknown,
  ) => operation("file:///library"),
}))
jest.mock("../query/invalidate-table", () => ({
  invalidateBookReadingFormat: jest.fn(),
  invalidateFileStates: jest.fn(),
}))
jest.mock("./transport", () => ({
  invokeCoreAsync: jest.fn(),
}))

import type { Library } from "@my-reader/tools/types/library"
import {
  finalizeDownloadedFile,
  listBookCoverThumbnailCache,
  listBookReadingFormats,
  setBookReadingFormat,
  upsertBookCoverThumbnailCache,
  upsertFileState,
} from "./content"
import { invokeCoreAsync } from "./transport"

const library = { id: "library-1" } as Library

describe("core content adapter", () => {
  const mockInvokeCoreAsync = jest.mocked(invokeCoreAsync)

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("should return validated reading formats when core returns a typed map", async () => {
    mockInvokeCoreAsync.mockResolvedValue({ "42": "PDF" })

    await expect(listBookReadingFormats(library)).resolves.toEqual({
      "42": "PDF",
    })
    expect(mockInvokeCoreAsync).toHaveBeenCalledWith(
      "content",
      "listReadingFormats",
      {
        sidecarRootPath: "/sidecar",
        libraryRootPath: "/library",
      },
    )
  })

  it("should send nullable format when reading format changes", async () => {
    mockInvokeCoreAsync.mockResolvedValue(null)

    await setBookReadingFormat(library, 42, null)

    expect(mockInvokeCoreAsync).toHaveBeenCalledWith(
      "content",
      "setReadingFormat",
      {
        sidecarRootPath: "/sidecar",
        libraryRootPath: "/library",
        bookId: 42,
        format: null,
      },
    )
  })

  it("should pass typed file state update when download completes", async () => {
    mockInvokeCoreAsync.mockResolvedValue(null)

    await upsertFileState(library, "Author/Book/Book.epub", {
      localState: "present",
      localSize: 1024,
    })

    expect(mockInvokeCoreAsync).toHaveBeenCalledWith(
      "content",
      "upsertFileState",
      {
        sidecarRootPath: "/sidecar",
        path: "Author/Book/Book.epub",
        update: {
          localState: "present",
          localBlake3: null,
          localSize: 1024,
          localMtime: null,
        },
      },
    )
  })

  it("should delegate final state commit when downloaded file is finalized", async () => {
    mockInvokeCoreAsync.mockResolvedValue({ size: 1024, mtimeMs: 2000 })

    await expect(
      finalizeDownloadedFile(
        library,
        "Author/Book/Book.epub",
        "file:///library/Author/Book/Book.epub",
      ),
    ).resolves.toEqual({ size: 1024, mtimeMs: 2000 })

    expect(mockInvokeCoreAsync).toHaveBeenCalledWith(
      "content",
      "finalizeDownloadedFile",
      {
        sidecarRootPath: "/sidecar",
        relativePath: "Author/Book/Book.epub",
        localPath: "/library/Author/Book/Book.epub",
      },
    )
  })

  it("should delegate cover manifest persistence when thumbnail is generated", async () => {
    mockInvokeCoreAsync.mockResolvedValue(null)
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

    expect(mockInvokeCoreAsync).toHaveBeenCalledWith(
      "content",
      "upsertCoverThumbnailCache",
      {
        sidecarRootPath: "/sidecar",
        patch,
      },
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
    mockInvokeCoreAsync.mockResolvedValue(rows)

    await expect(
      listBookCoverThumbnailCache(library, {
        thumbnailVersion: "v3",
        widthPx: 180,
        heightPx: 270,
      }),
    ).resolves.toEqual(rows)
  })
})
