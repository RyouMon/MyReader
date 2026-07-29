import type { DataSource } from "@my-reader/tools/types/data-source"
import type { Library } from "@my-reader/tools/types/library"

const mockAddRemoteLibrary = jest.fn()
const mockAddLocalDeviceLibrary = jest.fn()
const mockRunLibrarySync = jest.fn()
const mockSetLibraries = jest.fn()
const mockSetActiveLibraryId = jest.fn()

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

jest.mock("@/src/services/core/device-registry", () => ({
  addLocalDeviceLibrary: (...args: unknown[]) =>
    mockAddLocalDeviceLibrary(...args),
  initializeDeviceRegistry: jest.fn(),
  removeDeviceLibrary: jest.fn(),
  switchDeviceLibrary: jest.fn(),
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
    invalidateQueries: jest.fn(),
  },
}))

jest.mock("@/src/store/app-store", () => ({
  useAppStore: {
    getState: () => ({
      setLibraries: mockSetLibraries,
      setActiveLibraryId: mockSetActiveLibraryId,
    }),
  },
}))

import { addLibraryFromPicker, registerRemoteLibrary } from "./library-actions"

describe("registerRemoteLibrary", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("should resolve after registration when initial sync is still pending", async () => {
    const source = {
      id: "source-1",
      type: "onedrive",
      name: "OneDrive",
    } as DataSource
    const library = {
      id: "library-1",
      name: "CalibreLibrary",
    } as Library
    const registry = {
      libraries: [library],
      activeLibraryId: library.id,
    }
    mockAddRemoteLibrary.mockResolvedValue({ library, registry })
    let finishSync: (() => void) | undefined
    mockRunLibrarySync.mockReturnValue(
      new Promise<void>((resolve) => {
        finishSync = resolve
      }),
    )

    const result = await Promise.race([
      registerRemoteLibrary(source, "/Library/CalibreLibrary"),
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

  it("should resolve after registration when initial sync is still pending", async () => {
    const library = {
      id: "library-1",
      name: "CalibreLibrary",
      path: "file:///Library/CalibreLibrary",
    } as Library
    const registry = {
      libraries: [library],
      activeLibraryId: library.id,
    }
    mockAddLocalDeviceLibrary.mockResolvedValue({ library, registry })
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
