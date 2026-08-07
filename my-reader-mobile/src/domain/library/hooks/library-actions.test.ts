import type { DataSource } from "@my-reader/tools/types/data-source"
import type { Library } from "@my-reader/tools/types/library"

const mockAddRemoteLibrary = jest.fn()
const mockCreateAndroidSafMirrorDirectory = jest.fn()
const mockCreateExclusiveLibraryDirectory = jest.fn()
const mockCreateSecurityScopedBookmark = jest.fn()
const mockOpenRemoteMyReaderLibrary = jest.fn()
const mockAddLocalAppLibrary = jest.fn()
const mockCreateLocalMyReaderLibrary = jest.fn()
const mockOpenLocalMyReaderLibrary = jest.fn()
const mockDirectoryDelete = jest.fn()
const mockDirectoryCreate = jest.fn()
const mockFileCopy = jest.fn()
const mockFileDelete = jest.fn()
const mockPickFile = jest.fn()
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
const mockPushAndroidSafControl = jest.fn((_library: unknown) =>
  Promise.resolve(),
)
let mockLibraries: Library[] = []
let mockActiveLibraryId: string | null = null
let mockDataSources: DataSource[] = []
let mockPlatform: "ios" | "android" = "ios"

jest.mock("react-native", () => ({
  Platform: {
    get OS() {
      return mockPlatform
    },
  },
}))

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
  File: Object.assign(
    jest.fn((parent: { uri: string }, name: string) => ({
      delete: mockFileDelete,
      exists: true,
      uri: `${parent.uri}/${name}`,
    })),
    { pickFileAsync: (...args: unknown[]) => mockPickFile(...args) },
  ),
  Paths: {
    cache: "file:///cache",
    document: "file:///documents",
  },
}))

jest.mock("@/src/services/core/remote", () => ({
  addRemoteLibrary: (...args: unknown[]) => mockAddRemoteLibrary(...args),
  openRemoteMyreaderLibrary: (...args: unknown[]) =>
    mockOpenRemoteMyReaderLibrary(...args),
}))

jest.mock("@/src/domain/sync/hooks/run-library-sync", () => ({
  runLibrarySync: (input: unknown) => mockRunLibrarySync(input),
}))

jest.mock("@/src/domain/library/android-saf-library", () => ({
  createAndroidSafMirrorDirectory: (...args: unknown[]) =>
    mockCreateAndroidSafMirrorDirectory(...args),
  deleteAndroidSafMirror: jest.fn(),
  pullAndroidSafControl: jest.fn(),
  pushAndroidSafControl: (library: unknown) =>
    mockPushAndroidSafControl(library),
}))

jest.mock("@/src/services/fs/library-directory", () => ({
  createExclusiveLibraryDirectory: (...args: unknown[]) =>
    mockCreateExclusiveLibraryDirectory(...args),
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
  openLocalMyReaderLibrary: (...args: unknown[]) =>
    mockOpenLocalMyReaderLibrary(...args),
  initializeAppConfig: jest.fn(),
  removeAppLibrary: (...args: unknown[]) => mockRemoveAppLibrary(...args),
  replaceAppLibrary: (...args: unknown[]) => mockReplaceAppLibrary(...args),
  switchAppLibrary: (...args: unknown[]) => mockSwitchAppLibrary(...args),
}))

jest.mock("@/src/services/fs/library-paths", () => ({
  libraryContainerRootUri: (id: string) => `file:///documents/libraries/${id}`,
  librariesContainerRootUri: () => "file:///documents/libraries",
  METADATA_DB_RELATIVE: "metadata.db",
  usesLibraryContainerSidecar: (library: Library) =>
    library.libraryType === "myreader" ||
    library.sourceType === "webdav" ||
    library.sourceType === "onedrive",
}))

jest.mock("@/src/services/fs/bookmarks", () => ({
  createSecurityScopedBookmark: (...args: unknown[]) =>
    mockCreateSecurityScopedBookmark(...args),
  withSecurityScopedLibraryAccess: async (
    library: Library,
    callback: (path: string) => Promise<unknown>,
  ) => ({
    result: await callback(library.path),
  }),
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
  addLibraryFromPicker,
  addRemoteLibraryFromSource,
  createFolderMyReaderLibrary,
  deleteManagedBook,
  importBookFromFile,
  importBookFromPicker,
  openExistingLocalLibraryFromPicker,
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

describe("folder library creation", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockPlatform = "ios"
    mockLibraries = []
    mockCreateAndroidSafMirrorDirectory.mockReturnValue({
      delete: mockDirectoryDelete,
      exists: true,
      uri: "file:///documents/saf-library-mirrors/generated-id",
    })
    mockCreateExclusiveLibraryDirectory.mockImplementation(
      (parentUri: string, name: string) => ({
        delete: mockDirectoryDelete,
        exists: true,
        uri: `${parentUri}/${name}`,
      }),
    )
    mockCreateSecurityScopedBookmark.mockImplementation((uri: string) =>
      Promise.resolve({
        bookmarkBase64: "child-bookmark-data",
        resolvedUri: uri,
        stale: false,
      }),
    )
  })

  it("should create an iOS library while security-scoped access is active", async () => {
    const picked = {
      name: "Selected Folder",
      uri: "file:///external/Selected Folder",
      securityScopedBookmark: {
        bookmarkBase64: "bookmark-data",
        resolvedUri: "file:///external/Selected Folder",
        stale: false,
      },
    }
    const library = {
      id: "library-1",
      name: "Travel",
      path: "file:///external/Selected Folder/Travel",
      libraryType: "myreader",
      sourceType: "local",
      bookCount: 0,
      securityScopedBookmark: {
        bookmarkBase64: "child-bookmark-data",
        resolvedUri: "file:///external/Selected Folder/Travel",
        stale: false,
      },
    } as Library
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
    expect(mockCreateLocalMyReaderLibrary).toHaveBeenCalledWith(
      expect.objectContaining({
        libraryRootUri: "file:///external/Selected Folder/Travel",
        name: "Travel",
        path: "file:///external/Selected Folder/Travel",
        securityScopedBookmark: library.securityScopedBookmark,
      }),
    )
    expect(mockRunLibrarySync).toHaveBeenCalledWith(
      expect.objectContaining({ libraryId: library.id, trigger: "add" }),
    )
  })

  it("should create an Android library through its selected SAF tree", async () => {
    mockPlatform = "android"
    const picked = {
      name: "Selected Folder",
      uri: "content://tree/primary%3ABooks%2FSelected",
    }
    const library = {
      id: "library-1",
      name: "Travel",
      path: "file:///documents/saf-library-mirrors/generated-id",
      sourcePath: "content://tree/primary%3ABooks%2FSelected/Travel",
      libraryType: "myreader",
      sourceType: "local",
      bookCount: 0,
    } as Library
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
    expect(mockCreateLocalMyReaderLibrary).toHaveBeenCalledWith(
      expect.objectContaining({
        libraryRootUri: "file:///documents/saf-library-mirrors/generated-id",
        name: "Travel",
        sourcePath: "content://tree/primary%3ABooks%2FSelected/Travel",
      }),
    )
    expect(mockPushAndroidSafControl).toHaveBeenCalledWith(library)
    expect(mockRunLibrarySync).toHaveBeenCalledWith(
      expect.objectContaining({ libraryId: library.id, trigger: "add" }),
    )
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
    mockPickFile.mockResolvedValue({ canceled: true })

    await expect(importBookFromPicker()).resolves.toBeNull()

    expect(mockPickFile).toHaveBeenCalledWith({ mimeTypes: "*/*" })
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

    expect(mockCreateLocalMyReaderLibrary).not.toHaveBeenCalled()
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

  it("should expose a remote import immediately while its upload runs in the background", async () => {
    const pickedFile = {
      copy: mockFileCopy,
      extension: ".epub",
      name: "Queued Book.epub",
      uri: "file:///tmp/Queued Book.epub",
    }
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
    mockPickFile.mockResolvedValue({ canceled: false, result: pickedFile })
    mockImportBookIntoLibrary.mockResolvedValue({ id: 42 })
    mockReplaceAppLibrary.mockResolvedValue({
      libraries: [{ ...library, bookCount: 4 }],
      activeLibraryId: library.id,
    })

    const result = await importBookFromPicker(library)

    expect(mockReplaceAppLibrary).toHaveBeenCalledWith({
      ...library,
      bookCount: 4,
    })
    expect(mockFileCopy).not.toHaveBeenCalled()
    expect(mockShowAlert).not.toHaveBeenCalled()
    expect(result).toEqual({ library, bookId: 42 })
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
    mockPlatform = "android"
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

  it("should preserve source files for a legacy app-stored library", async () => {
    const removedLibrary = {
      id: "library-1",
      name: "My Library",
      path: "file:///documents/managed-libraries/owned-root",
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

    expect(mockDirectoryDelete).not.toHaveBeenCalledWith(removedLibrary.path)
    expect(mockDirectoryDelete).toHaveBeenCalledWith(
      "file:///documents/libraries/library-1",
    )
  })

  it("should preserve the source folder when removing a folder-backed library", async () => {
    const removedLibrary = {
      id: "library-1",
      name: "My Library",
      path: "file:///external/My Library",
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

    expect(mockDirectoryDelete).not.toHaveBeenCalledWith(removedLibrary.path)
    expect(mockDirectoryDelete).toHaveBeenCalledWith(
      "file:///documents/libraries/library-1",
    )
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

describe("openExistingLocalLibraryFromPicker", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("should fall back to Calibre only when the MyReader marker is absent", async () => {
    const library = {
      id: "library-1",
      name: "Local Library",
      path: "file:///Library/Local",
    } as Library
    const config = {
      libraries: [library],
      activeLibraryId: library.id,
    }
    mockOpenLocalMyReaderLibrary.mockRejectedValue(
      new Error("MYREADER_LIBRARY_MARKER_NOT_FOUND"),
    )
    mockAddLocalAppLibrary.mockResolvedValue({ library, config })

    await expect(
      openExistingLocalLibraryFromPicker({
        uri: library.path,
        name: library.name,
      }),
    ).resolves.toBe(library)

    expect(mockAddLocalAppLibrary).toHaveBeenCalledTimes(1)
  })
})

describe("addLibraryFromPicker", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("should resolve when initial sync is still pending after local addition", async () => {
    const library = {
      id: "library-1",
      name: "CalibreLibrary",
      path: "file:///Library/CalibreLibrary",
    } as Library
    const config = {
      libraries: [library],
      activeLibraryId: library.id,
    }
    mockAddLocalAppLibrary.mockResolvedValue({ library, config })
    let finishSync: (() => void) | undefined
    mockRunLibrarySync.mockReturnValue(
      new Promise<void>((resolve) => {
        finishSync = resolve
      }),
    )

    const result = await Promise.race([
      addLibraryFromPicker({
        uri: library.path,
        name: library.name,
      }),
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
