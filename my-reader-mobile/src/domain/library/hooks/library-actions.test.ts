import type { DataSource } from "@my-reader/tools/types/data-source"
import type { Library } from "@my-reader/tools/types/library"
import { Platform } from "react-native"

const mockAddRemoteLibrary = jest.fn()
const mockOpenRemoteMyReaderLibrary = jest.fn()
const mockCreateManagedLocalMyReaderLibrary = jest.fn()
const mockCreateLocalMyReaderLibrary = jest.fn()
const mockOpenLocalMyReaderLibrary = jest.fn()
const mockAddLocalAppLibrary = jest.fn()
const mockCreateSecurityScopedBookmark = jest.fn()
const mockCreateExclusiveLibraryDirectory = jest.fn()
const mockDirectoryDelete = jest.fn()
const mockDirectoryCreate = jest.fn()
const mockFileCopy = jest.fn()
const mockFileDelete = jest.fn()
const mockGetDocument = jest.fn()
const mockDeleteBookFromLibrary = jest.fn()
const mockImportBookIntoLibrary = jest.fn()
const mockCancelQueries = jest.fn((..._args: unknown[]) => Promise.resolve())
const mockInvalidateQueries = jest.fn((..._args: unknown[]) => undefined)
const mockSetQueryData = jest.fn((..._args: unknown[]) => undefined)
const mockRemoveAppLibrary = jest.fn()
const mockRemoveQueries = jest.fn((..._args: unknown[]) => undefined)
const mockReplaceAppLibrary = jest.fn()
const mockRunLibrarySync = jest.fn((_input: unknown) => Promise.resolve())
const mockScheduleIdleWork = jest.fn()
const mockSetLibraries = jest.fn((libraries: Library[]) => {
  mockLibraries = libraries
})
const mockSetActiveLibraryId = jest.fn((id: string | null) => {
  mockActiveLibraryId = id
})
const mockRemoveLibrarySyncStatus = jest.fn()
const mockSwitchAppLibrary = jest.fn()
const mockShowAlert = jest.fn()
let mockLibraries: Library[] = []
let mockActiveLibraryId: string | null = null
let mockDataSources: DataSource[] = []

jest.mock("expo-file-system", () => ({
  Directory: jest.fn((parent: string | { uri: string }, name?: string) => {
    const parentUri = typeof parent === "string" ? parent : parent.uri
    const uri = name ? `${parentUri}/${name}` : parentUri
    return {
      create: mockDirectoryCreate,
      delete: () => mockDirectoryDelete(uri),
      exists: true,
      uri,
    }
  }),
  File: jest.fn((parent: string | { uri: string }, name?: string) => {
    const parentUri = typeof parent === "string" ? parent : parent.uri
    const uri = name ? `${parentUri}/${name}` : parentUri
    return {
      delete: mockFileDelete,
      exists: true,
      extension: `.${uri.split(".").at(-1) ?? ""}`,
      name: uri.split("/").at(-1) ?? "",
      uri,
    }
  }),
  Paths: {
    cache: "file:///cache",
    document: "file:///documents",
  },
}))

jest.mock("expo-document-picker", () => ({
  getDocumentAsync: (...args: unknown[]) => mockGetDocument(...args),
}))

jest.mock("@/src/services/core/remote", () => ({
  addRemoteLibrary: (...args: unknown[]) => mockAddRemoteLibrary(...args),
  openRemoteMyreaderLibrary: (...args: unknown[]) =>
    mockOpenRemoteMyReaderLibrary(...args),
}))

jest.mock("@/src/domain/sync/hooks/run-library-sync", () => ({
  runLibrarySync: (input: unknown) => mockRunLibrarySync(input),
}))

jest.mock("@/src/domain/library/catalog", () => ({
  deleteBookFromLibrary: (...args: unknown[]) =>
    mockDeleteBookFromLibrary(...args),
  ensureLibraryMetadataCached: jest.fn(),
  importBookIntoLibrary: (...args: unknown[]) =>
    mockImportBookIntoLibrary(...args),
  libraryQueryKeys: {
    books: (id: string) => ["books", id],
    pendingImports: (id: string) => ["pending-book-imports", id],
  },
  mapListRowsToBookItems: (_library: unknown, books: { id: number }[]) =>
    books.map((book) => ({
      id: String(book.id),
      title: "Imported Book",
      author: "Unknown author",
    })),
}))

jest.mock("@/src/services/core/app-config", () => ({
  addLocalAppLibrary: (...args: unknown[]) => mockAddLocalAppLibrary(...args),
  createLocalMyReaderLibrary: (...args: unknown[]) =>
    mockCreateLocalMyReaderLibrary(...args),
  createManagedLocalMyReaderLibrary: (...args: unknown[]) =>
    mockCreateManagedLocalMyReaderLibrary(...args),
  initializeAppConfig: jest.fn(),
  removeAppLibrary: (...args: unknown[]) => mockRemoveAppLibrary(...args),
  replaceAppLibrary: (...args: unknown[]) => mockReplaceAppLibrary(...args),
  openLocalMyReaderLibrary: (...args: unknown[]) =>
    mockOpenLocalMyReaderLibrary(...args),
  switchAppLibrary: (...args: unknown[]) => mockSwitchAppLibrary(...args),
}))

jest.mock("@/src/services/fs/library-paths", () => ({
  libraryContainerRootUri: (id: string) => `file:///documents/libraries/${id}`,
  librariesContainerRootUri: () => "file:///documents/libraries",
  METADATA_DB_RELATIVE: "metadata.db",
}))

jest.mock("@/src/services/fs/bookmarks", () => ({
  createSecurityScopedBookmark: (...args: unknown[]) =>
    mockCreateSecurityScopedBookmark(...args),
  withSecurityScopedLibraryAccess: (
    library: Library,
    operation: (uri: string) => unknown,
  ) => operation(library.path),
}))

jest.mock("@/src/services/fs/library-directory", () => ({
  createExclusiveLibraryDirectory: (...args: unknown[]) =>
    mockCreateExclusiveLibraryDirectory(...args),
}))

jest.mock("@/src/services/fs/path", () => ({
  fileUriFor: (root: string, path: string) => `${root}/${path}`,
}))

jest.mock("@/src/services/query/query-client", () => ({
  queryClient: {
    cancelQueries: (...args: unknown[]) => mockCancelQueries(...args),
    invalidateQueries: (...args: unknown[]) => mockInvalidateQueries(...args),
    removeQueries: (...args: unknown[]) => mockRemoveQueries(...args),
    setQueryData: (...args: unknown[]) => mockSetQueryData(...args),
  },
}))

jest.mock("@/src/store/app-store", () => ({
  useAppStore: {
    getState: () => ({
      libraries: mockLibraries,
      activeLibraryId: mockActiveLibraryId,
      dataSources: mockDataSources,
      setLibraries: mockSetLibraries,
      setActiveLibraryId: mockSetActiveLibraryId,
      removeLibrarySyncStatus: mockRemoveLibrarySyncStatus,
    }),
  },
}))

jest.mock("@/src/utils/common", () => ({
  scheduleIdleWork: (...args: unknown[]) => mockScheduleIdleWork(...args),
  uuid: () => "generated-id",
}))

jest.mock("@/src/constants/alert-with-status-bar", () => ({
  showAlertWithStatusBarRestore: (...args: unknown[]) => mockShowAlert(...args),
}))

// Jest factories above must be registered before importing the module under test.
// eslint-disable-next-line import/first
import {
  addRemoteLibraryFromSource,
  createAppInternalMyReaderLibrary,
  createFolderMyReaderLibrary,
  deleteManagedBook,
  importBookFromFile,
  importBookFromPicker,
  openRemoteExistingLibrary,
  removeLibrary,
} from "./library-actions"

describe("managed book deletion", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockDeleteBookFromLibrary.mockResolvedValue(undefined)
    mockReplaceAppLibrary.mockReset()
  })

  it("should remove the cached book before persisting the library count", async () => {
    const library = {
      id: "library-1",
      name: "My Library",
      path: "file:///Library/My Library",
      libraryType: "myreader",
      sourceType: "local",
      bookCount: 2,
    } as Library
    let finishCountUpdate: (() => void) | undefined
    mockReplaceAppLibrary.mockReturnValueOnce(
      new Promise((resolve) => {
        finishCountUpdate = () =>
          resolve({ libraries: [library], activeLibraryId: library.id })
      }),
    )

    const deletion = deleteManagedBook(library, 1)
    await Promise.resolve()
    await Promise.resolve()

    const cacheUpdater = mockSetQueryData.mock.calls.find(
      ([queryKey]) =>
        JSON.stringify(queryKey) === JSON.stringify(["books", library.id]),
    )?.[1] as ((books: { id: string }[]) => { id: string }[]) | undefined
    expect(cacheUpdater).toBeDefined()
    expect(cacheUpdater?.([{ id: "1" }, { id: "2" }])).toEqual([{ id: "2" }])
    expect(mockInvalidateQueries).not.toHaveBeenCalled()

    finishCountUpdate?.()
    await deletion

    expect(mockCancelQueries).toHaveBeenCalledWith({
      queryKey: ["books", library.id],
      exact: true,
    })
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["books", library.id],
    })
  })
})

describe("managed local library creation", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("should create and register the library under the app container", async () => {
    const library = {
      id: "library-1",
      name: "Travel",
      path: "file:///documents/libraries/library-1",
      libraryType: "myreader",
      sourceType: "local",
      bookCount: 0,
    } as Library
    mockLibraries = []
    mockActiveLibraryId = null
    mockCreateManagedLocalMyReaderLibrary.mockResolvedValue({
      library,
      config: { libraries: [library], activeLibraryId: library.id },
    })

    await expect(createAppInternalMyReaderLibrary("Travel")).resolves.toBe(
      library,
    )

    expect(mockCreateManagedLocalMyReaderLibrary).toHaveBeenCalledWith({
      librariesRootUri: "file:///documents/libraries",
      name: "Travel",
      addedAt: expect.any(Number),
    })
    expect(mockSetLibraries).toHaveBeenCalledWith([library])
    expect(mockSetActiveLibraryId).toHaveBeenCalledWith(library.id)
    expect(mockRunLibrarySync).toHaveBeenCalledWith(
      expect.objectContaining({ libraryId: library.id, trigger: "add" }),
    )
  })

  it("should create an external library only through an iOS bookmark", async () => {
    Object.defineProperty(Platform, "OS", { configurable: true, value: "ios" })
    const picked = {
      uri: "file:///external/Books",
      name: "Books",
      securityScopedBookmark: {
        bookmarkBase64: "parent-bookmark",
        resolvedUri: "file:///external/Books",
        stale: false,
      },
    }
    const directory = {
      uri: "file:///external/Books/Travel",
      exists: true,
      delete: jest.fn(),
    }
    const bookmark = {
      bookmarkBase64: "library-bookmark",
      resolvedUri: directory.uri,
      stale: false,
    }
    const library = {
      id: "external",
      name: "Travel",
      path: directory.uri,
      libraryType: "myreader",
      sourceType: "local",
      securityScopedBookmark: bookmark,
      bookCount: 0,
    } as Library
    mockCreateExclusiveLibraryDirectory.mockReturnValue(directory)
    mockCreateSecurityScopedBookmark.mockResolvedValue(bookmark)
    mockCreateLocalMyReaderLibrary.mockResolvedValue({
      library,
      config: { libraries: [library], activeLibraryId: library.id },
    })

    await expect(createFolderMyReaderLibrary(picked, "Travel")).resolves.toBe(
      library,
    )

    expect(mockCreateExclusiveLibraryDirectory).toHaveBeenCalledWith(
      picked.uri,
      "Travel",
    )
    expect(mockCreateLocalMyReaderLibrary).toHaveBeenCalledWith({
      libraryRootUri: directory.uri,
      path: directory.uri,
      sidecarContainerParentUri: "file:///documents/libraries",
      name: "Travel",
      addedAt: expect.any(Number),
      securityScopedBookmark: bookmark,
    })
  })

  it("should reject external local storage on Android", async () => {
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: "android",
    })

    await expect(
      createFolderMyReaderLibrary(
        {
          uri: "content://tree/library",
          securityScopedBookmark: {
            bookmarkBase64: "bookmark",
            resolvedUri: "content://tree/library",
            stale: false,
          },
        },
        "Travel",
      ),
    ).rejects.toThrow("LOCAL_STORAGE_UNSUPPORTED")
    expect(mockCreateExclusiveLibraryDirectory).not.toHaveBeenCalled()
  })
})

describe("book import", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockLibraries = []
    mockActiveLibraryId = null
    mockDataSources = []
    mockSetLibraries.mockImplementation((libraries: Library[]) => {
      mockLibraries = libraries
    })
    mockSetActiveLibraryId.mockImplementation((id: string | null) => {
      mockActiveLibraryId = id
    })
  })

  it("should let the app validate extensions after the system picker returns", async () => {
    mockGetDocument.mockResolvedValue({ assets: null, canceled: true })

    await expect(importBookFromPicker()).resolves.toBeNull()

    expect(mockGetDocument).toHaveBeenCalledWith({
      copyToCacheDirectory: true,
      multiple: false,
      type: "*/*",
    })
  })

  it("should require a registered MyReader library", async () => {
    const sharedFile = {
      copy: mockFileCopy,
      extension: ".epub",
      name: "temporary-id.epub",
      uri: "file:///tmp/temporary-id.epub",
    }

    await expect(
      importBookFromFile(sharedFile as never, undefined, "Moby-Dick.epub"),
    ).rejects.toThrow("MYREADER_LIBRARY_REQUIRED")

    expect(mockCreateManagedLocalMyReaderLibrary).not.toHaveBeenCalled()
    expect(mockFileCopy).not.toHaveBeenCalled()
    expect(mockImportBookIntoLibrary).not.toHaveBeenCalled()
  })

  it("should preserve the original shared filename before copying to a temporary file", async () => {
    const sharedFile = {
      copy: mockFileCopy,
      extension: ".epub",
      name: "temporary-id.epub",
      uri: "file:///tmp/temporary-id.epub",
    }
    const library = {
      id: "library-1",
      name: "My Library",
      path: "file:///documents/libraries/library-1",
      libraryType: "myreader",
      bookCount: 0,
    } as Library
    mockLibraries = [library]
    mockActiveLibraryId = library.id
    mockImportBookIntoLibrary.mockResolvedValue({ id: 1 })
    mockReplaceAppLibrary.mockResolvedValue({
      libraries: [{ ...library, bookCount: 1 }],
      activeLibraryId: library.id,
    })

    await importBookFromFile(
      sharedFile as never,
      library,
      "Moby-Dick - Herman Melville.epub",
    )

    expect(mockImportBookIntoLibrary).toHaveBeenCalledWith(
      library,
      expect.objectContaining({
        sourceFileName: "Moby-Dick - Herman Melville.epub",
      }),
    )
  })

  it.each([
    ["EPUB", "Queued Book.epub"],
    ["PDF", "Queued Book.pdf"],
    ["CBZ", "Queued Book.cbz"],
  ])("should import %s using the original Android picker filename", async (_format, originalName) => {
    const pickedUri = "file:///cache/DocumentPicker/generated-id"
    const library = {
      id: "library-1",
      name: "Remote Library",
      path: "file:///documents/libraries/library-1",
      libraryType: "myreader",
      sourceType: "webdav",
      bookCount: 3,
    } as Library
    mockLibraries = [library]
    mockActiveLibraryId = library.id
    mockGetDocument.mockResolvedValue({
      assets: [{ name: originalName, uri: pickedUri }],
      canceled: false,
    })
    mockImportBookIntoLibrary.mockResolvedValue({ id: 42 })
    mockReplaceAppLibrary.mockResolvedValue({
      libraries: [{ ...library, bookCount: 4 }],
      activeLibraryId: library.id,
    })

    const result = await importBookFromPicker(library)

    expect(mockImportBookIntoLibrary).toHaveBeenCalledWith(
      library,
      expect.objectContaining({
        sourceFileName: originalName,
        sourceFileUri: pickedUri,
      }),
    )
    expect(mockReplaceAppLibrary).toHaveBeenCalledWith({
      ...library,
      bookCount: 4,
    })
    expect(mockFileCopy).not.toHaveBeenCalled()
    expect(mockShowAlert).not.toHaveBeenCalled()
    expect(result).toEqual({ library, bookId: 42 })
  })

  it("should reject a picker asset with an unsupported original filename", async () => {
    const library = {
      id: "library-1",
      name: "Remote Library",
      path: "file:///documents/libraries/library-1",
      libraryType: "myreader",
      sourceType: "webdav",
      bookCount: 3,
    } as Library
    mockLibraries = [library]
    mockActiveLibraryId = library.id
    mockGetDocument.mockResolvedValue({
      assets: [
        {
          name: "Notes.txt",
          uri: "file:///cache/DocumentPicker/generated-id",
        },
      ],
      canceled: false,
    })

    const result = await importBookFromPicker(library)

    expect(mockShowAlert).toHaveBeenCalledTimes(1)
    expect(mockImportBookIntoLibrary).not.toHaveBeenCalled()
    expect(result).toBeNull()
  })

  it("should publish an importing placeholder before file work completes", async () => {
    const pickedFile = {
      copy: mockFileCopy,
      extension: ".epub",
      name: "Slow Book.epub",
      uri: "file:///tmp/Slow Book.epub",
    }
    const library = {
      id: "library-1",
      name: "Remote Library",
      path: "file:///documents/libraries/library-1",
      libraryType: "myreader",
      sourceType: "webdav",
      bookCount: 0,
    } as Library
    mockLibraries = [library]
    mockActiveLibraryId = library.id
    let finishImport: ((book: { id: number }) => void) | undefined
    mockImportBookIntoLibrary.mockReturnValue(
      new Promise((resolve) => {
        finishImport = resolve
      }),
    )
    mockReplaceAppLibrary.mockResolvedValue({
      libraries: [{ ...library, bookCount: 1 }],
      activeLibraryId: library.id,
    })

    const importPromise = importBookFromFile(pickedFile as never, library)

    expect(mockSetQueryData).toHaveBeenCalledWith(
      ["pending-book-imports", library.id],
      expect.any(Function),
    )
    const addPlaceholder = mockSetQueryData.mock.calls[0]?.[1] as (
      current?: unknown[],
    ) => { importStatus?: string; title?: string }[]
    expect(addPlaceholder([])).toEqual([
      expect.objectContaining({
        importStatus: "importing",
        title: "Slow Book",
      }),
    ])

    finishImport?.({ id: 42 })
    await expect(importPromise).resolves.toEqual({ library, bookId: 42 })
  })

  it("should stage an Android content URI before Core consumes it", async () => {
    const pickedFile = {
      copy: mockFileCopy,
      extension: ".pdf",
      name: "Document.pdf",
      uri: "content://documents/42",
    }
    const library = {
      id: "library-1",
      name: "Remote Library",
      path: "file:///documents/libraries/library-1",
      libraryType: "myreader",
      sourceType: "webdav",
      bookCount: 0,
    } as Library
    mockLibraries = [library]
    mockActiveLibraryId = library.id
    mockImportBookIntoLibrary.mockResolvedValue({ id: 42 })
    mockReplaceAppLibrary.mockResolvedValue({
      libraries: [{ ...library, bookCount: 1 }],
      activeLibraryId: library.id,
    })

    await importBookFromFile(pickedFile as never, library)

    expect(mockFileCopy).toHaveBeenCalledWith(
      expect.objectContaining({
        uri: "file:///cache/book-imports/generated-id.pdf",
      }),
    )
    expect(mockImportBookIntoLibrary).toHaveBeenCalledWith(
      library,
      expect.objectContaining({
        consumeSourceFile: true,
        sourceFileName: "Document.pdf",
        sourceFileUri: "file:///cache/book-imports/generated-id.pdf",
      }),
    )
    expect(mockFileDelete).toHaveBeenCalledTimes(1)
  })
})

describe("removeLibrary", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockLibraries = []
  })

  it("should resolve before container cleanup when removing a remote library", async () => {
    const removedLibrary = {
      id: "library-1",
      name: "Remote Library",
      path: "file:///documents/libraries/library-1",
      sourceType: "onedrive",
    } as Library
    const remainingLibrary = {
      id: "library-2",
      name: "Remaining Library",
      path: "file:///Library/Remaining",
    } as Library
    let cleanup: (() => void) | undefined
    mockLibraries = [removedLibrary, remainingLibrary]
    mockRemoveAppLibrary.mockResolvedValue({
      libraries: [remainingLibrary],
      activeLibraryId: remainingLibrary.id,
    })
    mockScheduleIdleWork.mockImplementation((callback: () => void) => {
      cleanup = callback
      return 1
    })

    await removeLibrary(removedLibrary.id)

    expect(mockSetLibraries).toHaveBeenCalledWith([remainingLibrary])
    expect(mockSetActiveLibraryId).toHaveBeenCalledWith(remainingLibrary.id)
    expect(mockRemoveLibrarySyncStatus).toHaveBeenCalledWith(removedLibrary.id)
    expect(mockRemoveQueries).toHaveBeenCalledWith({
      queryKey: ["books", removedLibrary.id],
      exact: true,
    })
    expect(mockInvalidateQueries).not.toHaveBeenCalled()
    expect(mockDirectoryDelete).not.toHaveBeenCalled()

    cleanup?.()

    expect(mockDirectoryDelete).toHaveBeenCalledTimes(1)
  })

  it("should delete the app-owned container when removing a local library", async () => {
    const removedLibrary = {
      id: "library-1",
      name: "My Library",
      path: "file:///documents/libraries/library-1",
      libraryType: "myreader",
      sourceType: "local",
    } as Library
    let cleanup: (() => void) | undefined
    mockLibraries = [removedLibrary]
    mockRemoveAppLibrary.mockResolvedValue({
      libraries: [],
      activeLibraryId: null,
    })
    mockScheduleIdleWork.mockImplementation((callback: () => void) => {
      cleanup = callback
      return 1
    })

    await removeLibrary(removedLibrary.id)
    cleanup?.()

    expect(mockDirectoryDelete).toHaveBeenCalledWith(removedLibrary.path)
  })
})

describe("addRemoteLibraryFromSource", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("should resolve when initial sync is still pending after remote addition", async () => {
    const source = {
      id: "source-1",
      type: "onedrive",
      name: "OneDrive",
    } as DataSource
    const library = {
      id: "library-1",
      name: "CalibreLibrary",
    } as Library
    const config = {
      libraries: [library],
      activeLibraryId: library.id,
    }
    mockAddRemoteLibrary.mockResolvedValue({ library, config })
    let finishSync: (() => void) | undefined
    mockRunLibrarySync.mockReturnValue(
      new Promise<void>((resolve) => {
        finishSync = resolve
      }),
    )

    const result = await Promise.race([
      addRemoteLibraryFromSource(source, "/Library/CalibreLibrary"),
      new Promise<"timeout">((resolve) => {
        setTimeout(() => resolve("timeout"), 50)
      }),
    ])

    expect(result).toBe(library)
    expect(mockRunLibrarySync).toHaveBeenCalledWith({
      libraryId: library.id,
      trigger: "add",
      options: {
        forceCalibre: false,
        throwOnFailure: false,
      },
    })
    finishSync?.()
  })
})

describe("openRemoteExistingLibrary", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  const source = {
    id: "source-1",
    type: "onedrive",
    name: "OneDrive",
  } as DataSource
  const library = {
    id: "library-1",
    name: "Library",
  } as Library
  const config = {
    libraries: [library],
    activeLibraryId: library.id,
  }

  it("should fall back to Calibre only when the MyReader marker is absent", async () => {
    mockOpenRemoteMyReaderLibrary.mockRejectedValue(
      new Error("REMOTE_MYREADER_LIBRARY_MARKER_NOT_FOUND"),
    )
    mockAddRemoteLibrary.mockResolvedValue({ library, config })

    await expect(
      openRemoteExistingLibrary(source, "/Books/Library"),
    ).resolves.toBe(library)

    expect(mockAddRemoteLibrary).toHaveBeenCalledTimes(1)
  })

  it("should preserve a damaged MyReader library error", async () => {
    const error = new Error("MYREADER_LIBRARY_MARKER_INVALID")
    mockOpenRemoteMyReaderLibrary.mockRejectedValue(error)

    await expect(
      openRemoteExistingLibrary(source, "/Books/Library"),
    ).rejects.toBe(error)

    expect(mockAddRemoteLibrary).not.toHaveBeenCalled()
  })
})
