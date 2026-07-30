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

import MyReaderRustComponents from "@/modules/myreader-rust-components"
import type { Library } from "@my-reader/tools/types/library"
import {
  listBookReadingFormats,
  listBookCoverThumbnailCache,
  setBookReadingFormat,
  upsertBookCoverThumbnailCache,
  upsertFileState,
} from "./content"

const library = { id: "library-1" } as Library

describe("core content adapter", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("should return validated reading formats when core returns JSON", async () => {
    jest
      .spyOn(MyReaderRustComponents, "listBookReadingFormats")
      .mockResolvedValue(JSON.stringify({ "42": "PDF" }))

    await expect(listBookReadingFormats(library)).resolves.toEqual({
      "42": "PDF",
    })
    expect(MyReaderRustComponents.listBookReadingFormats).toHaveBeenCalledWith(
      "/sidecar",
      "/library",
    )
  })

  it("should send nullable format when reading format changes", async () => {
    jest
      .spyOn(MyReaderRustComponents, "setBookReadingFormat")
      .mockResolvedValue(undefined)

    await setBookReadingFormat(library, 42, null)

    expect(MyReaderRustComponents.setBookReadingFormat).toHaveBeenCalledWith(
      "/sidecar",
      "/library",
      42,
      null,
    )
  })

  it("should serialize file state update when download completes", async () => {
    jest
      .spyOn(MyReaderRustComponents, "upsertLibraryFileState")
      .mockResolvedValue(undefined)

    await upsertFileState(library, "Author/Book/Book.epub", {
      localState: "present",
      localSize: 1024,
    })

    expect(MyReaderRustComponents.upsertLibraryFileState).toHaveBeenCalledWith(
      "/sidecar",
      "Author/Book/Book.epub",
      JSON.stringify({
        localState: "present",
        localBlake3: null,
        localSize: 1024,
        localMtime: null,
      }),
    )
  })

  it("should delegate cover manifest persistence when thumbnail is generated", async () => {
    jest
      .spyOn(MyReaderRustComponents, "upsertBookCoverThumbnailCache")
      .mockResolvedValue(undefined)
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

    expect(
      MyReaderRustComponents.upsertBookCoverThumbnailCache,
    ).toHaveBeenCalledWith("/sidecar", JSON.stringify(patch))
  })

  it("should parse cover manifest rows when cache is loaded", async () => {
    const rows = [{ bookId: 42, fileName: "42.jpg" }]
    jest
      .spyOn(MyReaderRustComponents, "listBookCoverThumbnailCache")
      .mockResolvedValue(JSON.stringify(rows))

    await expect(
      listBookCoverThumbnailCache(library, {
        thumbnailVersion: "v3",
        widthPx: 180,
        heightPx: 270,
      }),
    ).resolves.toEqual(rows)
  })
})
