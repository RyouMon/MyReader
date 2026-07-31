import type { DataSource } from "@my-reader/tools/types/data-source"
import type { Library } from "@my-reader/tools/types/library"

const mockAddRemoteLibrary = jest.fn()
const mockAddLocalAppLibrary = jest.fn()
const mockDirectoryDelete = jest.fn()
const mockInvalidateQueries = jest.fn()
const mockRemoveAppLibrary = jest.fn()
const mockRemoveQueries = jest.fn()
const mockRunLibrarySync = jest.fn()
const mockScheduleIdleWork = jest.fn()
const mockSetLibraries = jest.fn()
const mockSetActiveLibraryId = jest.fn()
let mockLibraries: Library[] = []

jest.mock("expo-file-system", () => ({
  Directory: jest.fn(() => ({
    delete: mockDirectoryDelete,
    exists: true,
  })),
}))

jest.mock("@/src/services/core/remote", () => ({
  addRemoteLibrary: (...args: unknown[]) => mockAddRemoteLibrary(...args),
}))

jest.mock("@/src/domain/sync/hooks/run-library-sync", () => ({
  runLibrarySync: (...args: unknown[]) => mockRunLibrarySync(...args),
}))

jest.mock("@/src/domain/library/calibre", () => ({
  ensureLibraryMetadataCached: jest.fn(),
  libraryQueryKeys: {
    books: (id: string) => ["books", id],
  },
}))

jest.mock("@/src/services/core/app-config", () => ({
  addLocalAppLibrary: (...args: unknown[]) => mockAddLocalAppLibrary(...args),
  initializeAppConfig: jest.fn(),
  removeAppLibrary: (...args: unknown[]) => mockRemoveAppLibrary(...args),
  switchAppLibrary: jest.fn(),
}))

jest.mock("@/src/services/fs/library-paths", () => ({
  libraryContainerRootUri: (id: string) => `file:///documents/libraries/${id}`,
  librariesContainerRootUri: () => "file:///documents/libraries",
  METADATA_DB_RELATIVE: "metadata.db",
  usesIosContainerSidecar: jest.fn(() => false),
}))

jest.mock("@/src/services/fs/bookmarks", () => ({
  withSecurityScopedLibraryAccess: async (
    library: Library,
    callback: (path: string) => Promise<unknown>,
  ) => ({
    result: await callback(library.path),
  }),
}))

jest.mock("@/src/services/query/query-client", () => ({
  queryClient: {
    invalidateQueries: (...args: unknown[]) => mockInvalidateQueries(...args),
    removeQueries: (...args: unknown[]) => mockRemoveQueries(...args),
  },
}))

jest.mock("@/src/store/app-store", () => ({
  useAppStore: {
    getState: () => ({
      libraries: mockLibraries,
      setLibraries: mockSetLibraries,
      setActiveLibraryId: mockSetActiveLibraryId,
    }),
  },
}))

jest.mock("@/src/utils/common", () => ({
  scheduleIdleWork: (...args: unknown[]) => mockScheduleIdleWork(...args),
}))

// Jest factories above must be registered before importing the module under test.
// eslint-disable-next-line import/first
import {
  addLibraryFromPicker,
  addRemoteLibraryFromSource,
  removeLibrary,
} from "./library-actions"

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
    expect(mockRemoveQueries).toHaveBeenCalledWith({
      queryKey: ["books", removedLibrary.id],
      exact: true,
    })
    expect(mockInvalidateQueries).not.toHaveBeenCalled()
    expect(mockDirectoryDelete).not.toHaveBeenCalled()

    cleanup?.()

    expect(mockDirectoryDelete).toHaveBeenCalledTimes(1)
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
