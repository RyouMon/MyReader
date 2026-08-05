jest.mock("./context", () => ({
  openSyncContext: jest.fn(),
}))

jest.mock("./core-sync", () => ({
  runCoreLibrarySync: jest.fn(),
}))

jest.mock("../library/catalog", () => ({
  fetchBooks: jest.fn(),
}))

jest.mock("../../services/fs/local-library-content", () => ({
  withLocalLibraryContentRoot: jest.fn(
    (_library, operation: (root: string) => Promise<unknown>) =>
      operation("file:///resolved-library"),
  ),
}))

jest.mock("@/src/services/query/invalidate-table", () => ({
  invalidateFavoriteBooks: jest.fn(() => Promise.resolve()),
  invalidateReaderAnnotations: jest.fn(() => Promise.resolve()),
  invalidateReaderBookmarks: jest.fn(() => Promise.resolve()),
  invalidateReadingProgress: jest.fn(() => Promise.resolve()),
  invalidateReadingStatistics: jest.fn(() => Promise.resolve()),
  invalidateRecentlyReadBooks: jest.fn(() => Promise.resolve()),
}))

import type { LibrarySyncReport as CoreLibrarySyncReport } from "@/src/services/core/sync"
import {
  invalidateFavoriteBooks,
  invalidateReaderAnnotations,
  invalidateReaderBookmarks,
  invalidateReadingProgress,
  invalidateReadingStatistics,
  invalidateRecentlyReadBooks,
} from "@/src/services/query/invalidate-table"
import { DataIntegrityError, SyncConnectivityError } from "@/src/errors"
import { withLocalLibraryContentRoot } from "../../services/fs/local-library-content"
import { fetchBooks } from "../library/catalog"
import type { DataSource, Library } from "../types"
import { openSyncContext, type SyncTargetContext } from "./context"
import { runCoreLibrarySync } from "./core-sync"
import { DEFAULT_SYNC_POLICY } from "./policy"
import { syncLibraries, syncLibrary } from "./sync-library"

const mockOpenSyncContext = jest.mocked(openSyncContext)
const mockRunCoreLibrarySync = jest.mocked(runCoreLibrarySync)
const mockFetchBooks = jest.mocked(fetchBooks)

const library: Library = {
  id: "lib-1",
  name: "Test Library",
  path: "file:///tmp/lib",
  metadataUri: "file:///tmp/lib/metadata.db",
  bookCount: 1,
  addedAt: 0,
  dataSourceId: "local",
  sourceType: "local",
}

const refreshedLibrary: Library = {
  ...library,
  bookCount: 2,
  metadataEtag: "metadata-v2",
}
const coreLibrary: CoreLibrarySyncReport["calibre"]["library"] = {
  id: library.id,
  name: library.name,
  path: library.path,
  metadataUri: library.metadataUri,
  bookCount: library.bookCount,
  addedAt: library.addedAt,
  dataSourceId: "local",
  sourceType: "local",
}
const refreshedCoreLibrary: CoreLibrarySyncReport["calibre"]["library"] = {
  ...coreLibrary,
  bookCount: 2,
  metadataEtag: "metadata-v2",
}

const dataSources: DataSource[] = []

const localContext = {
  library,
  libraryRootUri: "file:///tmp/lib",
  librarySidecarRootUri: "file:///tmp/lib",
  dataSourceId: "local",
  libraryId: library.id,
  backend: { kind: "local-direct" as const },
  libraryStorage: { kind: "local-direct" as const, root: "/tmp/lib" },
} as SyncTargetContext

const remoteContext = {
  ...localContext,
  libraryRootUri: "file:///cache/lib-1",
  backend: { kind: "webdav" as const },
  libraryStorage: {
    kind: "webdav" as const,
    endpoint: "https://dav.example.test",
    username: "reader",
    password: "secret",
    root: "/Library",
  },
} as SyncTargetContext

function coreReport(
  overrides: Partial<CoreLibrarySyncReport> = {},
): CoreLibrarySyncReport {
  return {
    libraryId: library.id,
    libraryName: library.name,
    durationMs: 12,
    calibre: {
      skipped: false,
      changed: true,
      library: refreshedCoreLibrary,
    },
    myreader: {
      skipped: false,
      mode: "full",
      pushed: 1,
      pulled: 0,
    },
    ...overrides,
  }
}

describe("syncLibrary", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockOpenSyncContext.mockResolvedValue(localContext)
    mockRunCoreLibrarySync.mockResolvedValue(coreReport())
    mockFetchBooks.mockResolvedValue([])
  })

  it("should delegate the complete sync use case to Core when scope is all", async () => {
    const books = [{ id: "1", title: "Book", author: "Author" }]
    mockFetchBooks.mockResolvedValue(books)

    const report = await syncLibrary(library, dataSources, {
      scope: "all",
      forceCalibre: true,
      myreaderMode: "full",
    })

    expect(runCoreLibrarySync).toHaveBeenCalledWith({
      library,
      libraryRootUri: "file:///resolved-library",
      nowMs: expect.any(Number),
      scope: "all",
      forceCalibre: true,
      mode: "full",
      storage: localContext.libraryStorage,
      taskId: undefined,
      onSidecarComplete: expect.any(Function),
    })
    expect(withLocalLibraryContentRoot).toHaveBeenCalledWith(
      library,
      expect.any(Function),
    )
    expect(fetchBooks).toHaveBeenCalledWith(refreshedLibrary, dataSources)
    expect(report.calibre.books).toBe(books)
    expect(report.calibre.library).toEqual(refreshedLibrary)
  })

  it("should pass a remote cache root directly when a remote library is synced", async () => {
    mockOpenSyncContext.mockResolvedValue(remoteContext)
    mockRunCoreLibrarySync.mockResolvedValue(
      coreReport({
        calibre: {
          skipped: true,
          skipReason: "not_applicable",
          changed: false,
          library: coreLibrary,
        },
      }),
    )

    await syncLibrary(library, dataSources, {
      scope: "myreader",
      myreaderMode: "push_only",
      myreaderTaskId: "task-1",
    })

    expect(withLocalLibraryContentRoot).not.toHaveBeenCalled()
    expect(runCoreLibrarySync).toHaveBeenCalledWith(
      expect.objectContaining({
        libraryRootUri: "file:///cache/lib-1",
        scope: "myreader",
        forceCalibre: false,
        mode: "push_only",
        taskId: "task-1",
      }),
    )
    expect(fetchBooks).not.toHaveBeenCalled()
  })

  it("should refresh sidecar queries when Core reports pulled changes", async () => {
    mockRunCoreLibrarySync.mockImplementation(async (input) => {
      input.onSidecarComplete?.({ pushed: 0, pulled: 2 })
      return coreReport()
    })

    await syncLibrary(library, dataSources)

    for (const invalidate of [
      invalidateFavoriteBooks,
      invalidateReadingProgress,
      invalidateReadingStatistics,
      invalidateReaderAnnotations,
      invalidateReaderBookmarks,
      invalidateRecentlyReadBooks,
    ]) {
      expect(invalidate).toHaveBeenCalledWith(library.id)
    }
  })

  it("should return a skipped report when the platform context cannot open", async () => {
    mockOpenSyncContext.mockRejectedValue(new Error("missing credential"))

    const report = await syncLibrary(library, dataSources, {
      myreaderMode: "push_only",
    })

    expect(report).toMatchObject({
      libraryId: library.id,
      error: "missing credential",
      calibre: {
        skipped: true,
        skipReason: "error",
        changed: false,
      },
      myreader: {
        skipped: true,
        skipReason: "error",
        mode: "push_only",
      },
    })
    expect(runCoreLibrarySync).not.toHaveBeenCalled()
  })

  it("should throw a typed connectivity error when Core reports connectivity failure", async () => {
    mockRunCoreLibrarySync.mockResolvedValue(
      coreReport({
        error: "network unavailable",
        failureKind: "connectivity",
      }),
    )

    await expect(
      syncLibrary(library, dataSources, { throwOnFailure: true }),
    ).rejects.toBeInstanceOf(SyncConnectivityError)
  })

  it("should throw a typed data integrity error when Core reports damaged history", async () => {
    mockRunCoreLibrarySync.mockResolvedValue(
      coreReport({
        error: "missing change abc",
        failureKind: "data_integrity",
      }),
    )

    await expect(
      syncLibrary(library, dataSources, { throwOnFailure: true }),
    ).rejects.toBeInstanceOf(DataIntegrityError)
  })
})

describe("syncLibraries", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockOpenSyncContext.mockResolvedValue(localContext)
    mockRunCoreLibrarySync.mockResolvedValue(coreReport())
    mockFetchBooks.mockResolvedValue([])
  })

  it("should abort startup sync when startup sync is disabled", async () => {
    const report = await syncLibraries(
      {
        libraries: [library],
        dataSources,
        activeLibraryId: library.id,
        syncOnStartup: false,
        enableAutoSync: true,
      },
      "startup",
    )

    expect(report.aborted).toBe(true)
    expect(report.results).toHaveLength(0)
    expect(openSyncContext).not.toHaveBeenCalled()
  })

  it("should abort scheduled sync when automatic sync is disabled", async () => {
    const report = await syncLibraries(
      {
        libraries: [library],
        dataSources,
        activeLibraryId: library.id,
        syncOnStartup: true,
        enableAutoSync: false,
      },
      "scheduled",
    )

    expect(report.aborted).toBe(true)
    expect(report.results).toHaveLength(0)
    expect(openSyncContext).not.toHaveBeenCalled()
  })

  it("should abort sync when its trigger policy is disabled", async () => {
    const report = await syncLibraries(
      {
        libraries: [library],
        dataSources,
        activeLibraryId: library.id,
        syncOnStartup: true,
        enableAutoSync: true,
      },
      "manual",
      {
        ...DEFAULT_SYNC_POLICY,
        manual: { ...DEFAULT_SYNC_POLICY.manual, enabled: false },
      },
    )

    expect(report.aborted).toBe(true)
    expect(report.results).toHaveLength(0)
    expect(openSyncContext).not.toHaveBeenCalled()
  })

  it("should target only the active library when scheduled reading sync runs", async () => {
    const otherLibrary: Library = { ...library, id: "lib-2", name: "Other" }

    await syncLibraries(
      {
        libraries: [library, otherLibrary],
        dataSources,
        activeLibraryId: library.id,
        syncOnStartup: true,
        enableAutoSync: true,
      },
      "scheduled",
      undefined,
      "reading",
    )

    expect(openSyncContext).toHaveBeenCalledTimes(1)
    expect(openSyncContext).toHaveBeenCalledWith(library, dataSources)
    expect(runCoreLibrarySync).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: "myreader",
        mode: "push_only",
      }),
    )
  })
})
