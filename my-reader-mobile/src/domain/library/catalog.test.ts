import type { CalibreBook } from "@my-reader/tools/types/book"
import type { DataSource, Library } from "@/src/domain/types"
import {
  fetchBooks,
  importBookIntoLibrary,
  mapListRowsToBookItems,
} from "./catalog"

const mockCreateRemoteOps = jest.fn()
const mockListLibraryBooks = jest.fn()
const mockRefreshRemoteLibrary = jest.fn()
const mockImportRemoteBook = jest.fn()
const mockRequestPendingBookUploads = jest.fn()
const mockWithLocalLibraryContentRoot = jest.fn(
  async (
    _library: Library,
    operation: (libraryRootUri: string) => Promise<unknown>,
  ) => operation("file:///documents/libraries/library-1"),
)

jest.mock("expo-file-system", () => ({
  Directory: jest.fn(),
  File: jest.fn(() => ({ exists: false, size: 0 })),
}))

jest.mock("./remote-library", () => ({
  createRemoteOps: (...args: unknown[]) => mockCreateRemoteOps(...args),
}))

jest.mock("../../services/core/remote", () => ({
  refreshRemoteLibrary: (...args: unknown[]) =>
    mockRefreshRemoteLibrary(...args),
}))

jest.mock("../../services/core/catalog", () => ({
  importRemoteBook: (...args: unknown[]) => mockImportRemoteBook(...args),
  listLibraryBooks: (...args: unknown[]) => mockListLibraryBooks(...args),
}))

jest.mock("@/src/domain/sync/book-upload-store", () => ({
  requestPendingBookUploads: (...args: unknown[]) =>
    mockRequestPendingBookUploads(...args),
}))

jest.mock("../../services/fs/local-library-content", () => ({
  resolveLocalLibraryMetadataUri: jest.fn(),
  withLocalLibraryContentRoot: (
    library: Library,
    operation: (libraryRootUri: string) => Promise<unknown>,
  ) => mockWithLocalLibraryContentRoot(library, operation),
}))

jest.mock("@/src/services/fs/library-paths", () => ({
  ensureLibrarySidecarDirectory: jest.fn(),
  libraryMetadataUri: (library: Library) =>
    `file:///documents/libraries/${library.id}/metadata.db`,
  libraryRootUri: (library: Library) =>
    `file:///documents/libraries/${library.id}`,
  librarySidecarRootUri: (library: Library) =>
    `file:///documents/libraries/${library.id}`,
  resolveCoverUri: jest.fn(),
}))

jest.mock("../../services/query/query-client", () => ({
  queryClient: { getQueryData: jest.fn() },
}))

describe("fetchBooks", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockListLibraryBooks.mockResolvedValue([])
  })

  it("should use the local projection when a remote library is MyReader", async () => {
    const library: Library = {
      id: "library-1",
      name: "MyReader Test",
      path: "file:///documents/libraries/library-1",
      bookCount: 0,
      libraryType: "myreader",
      dataSourceId: "onedrive-1",
      sourceType: "onedrive",
      sourcePath: "/Library/MyReaderTest",
    }

    await expect(fetchBooks(library, [])).resolves.toEqual([])

    expect(mockRefreshRemoteLibrary).not.toHaveBeenCalled()
    expect(mockListLibraryBooks).toHaveBeenCalledWith(
      library,
      "file:///documents/libraries/library-1",
      "file:///documents/libraries/library-1",
    )
  })

  it("should refresh through core when remote Calibre metadata is missing", async () => {
    const library: Library = {
      id: "library-1",
      name: "Calibre Test",
      path: "file:///documents/libraries/library-1",
      bookCount: 0,
      libraryType: "calibre",
      dataSourceId: "onedrive-1",
      sourceType: "onedrive",
      sourcePath: "/Library/CalibreTest",
    }
    const source: DataSource = {
      id: "onedrive-1",
      type: "onedrive",
      name: "OneDrive",
      enabled: true,
      clientId: "client-id",
      hasRefreshToken: true,
    }
    mockRefreshRemoteLibrary.mockResolvedValue({ library })

    await expect(fetchBooks(library, [source])).resolves.toEqual([])

    expect(mockRefreshRemoteLibrary).toHaveBeenCalledWith(library, source)
    expect(mockListLibraryBooks).toHaveBeenCalledWith(
      library,
      "file:///documents/libraries/library-1",
      "file:///documents/libraries/library-1",
    )
  })
})

describe("mapListRowsToBookItems", () => {
  it("should preserve the book UUID when a catalog row is mapped", () => {
    const library: Library = {
      id: "library-1",
      name: "MyReader Test",
      path: "file:///documents/libraries/library-1",
      bookCount: 1,
      libraryType: "myreader",
      sourceType: "local",
    }
    const row: CalibreBook = {
      id: 42,
      title: "Earthsea",
      authorSort: "Le Guin, Ursula K.",
      authors: ["Ursula K. Le Guin"],
      tags: [],
      series: null,
      seriesIndex: null,
      formats: ["EPUB"],
      readableFormats: ["EPUB"],
      preferredFormat: "EPUB",
      hasCover: false,
      path: "Books/book-uuid",
      timestamp: null,
      pubdate: null,
      lastModified: null,
      comment: null,
      publisher: null,
      languages: [],
      rating: null,
      uuid: "book-uuid",
    }

    expect(mapListRowsToBookItems(library, [row])[0]?.uuid).toBe("book-uuid")
  })
})

describe("importBookIntoLibrary", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("should stage a remote MyReader book without resolving network storage", async () => {
    const library: Library = {
      id: "library-1",
      name: "MyReader Test",
      path: "file:///documents/libraries/library-1",
      bookCount: 0,
      libraryType: "myreader",
      dataSourceId: "onedrive-1",
      sourceType: "onedrive",
      sourcePath: "/Library/MyReaderTest",
    }
    mockImportRemoteBook.mockResolvedValue({ id: 42, uuid: "book-uuid" })

    await expect(
      importBookIntoLibrary(library, {
        sourceFileUri: "file:///inbox/Earthsea.epub",
        sourceFileName: "Earthsea.epub",
        authors: ["Ursula K. Le Guin"],
        consumeSourceFile: true,
      }),
    ).resolves.toEqual({ id: 42, uuid: "book-uuid" })

    expect(mockImportRemoteBook).toHaveBeenCalledWith(
      library,
      "file:///documents/libraries/library-1",
      "file:///documents/libraries/library-1",
      {
        sourceFileUri: "file:///inbox/Earthsea.epub",
        sourceFileName: "Earthsea.epub",
        authors: ["Ursula K. Le Guin"],
        consumeSourceFile: true,
      },
    )
    expect(mockRequestPendingBookUploads).toHaveBeenCalledWith(
      "library-1",
      "book-uuid",
    )
  })
})
