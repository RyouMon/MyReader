import {
  invalidateFavoriteBooks,
  invalidateReaderAnnotations,
  invalidateReaderBookmarks,
  invalidateReadingProgress,
  invalidateReadingStatistics,
  invalidateRecentlyReadBooks,
} from "@/src/services/query/invalidate-table"
import type { SyncTargetContext } from "./context"
import { syncLibrarySidecarDatabase } from "./library-sidecar/sync-database"
import { syncMyReader } from "./myreader-sync"

jest.mock("./library-sidecar/sync-database", () => ({
  syncLibrarySidecarDatabase: jest.fn(),
}))

jest.mock("@/src/services/query/invalidate-table", () => ({
  invalidateFavoriteBooks: jest.fn(),
  invalidateReadingProgress: jest.fn(),
  invalidateReadingStatistics: jest.fn(),
  invalidateReaderAnnotations: jest.fn(),
  invalidateReaderBookmarks: jest.fn(),
  invalidateRecentlyReadBooks: jest.fn(),
}))

const context = {
  library: {
    id: "library-1",
    name: "Library",
    path: "file:///library",
    addedAt: 0,
    bookCount: 1,
    sourceType: "local",
  },
  libraryRootUri: "file:///library",
  librarySidecarRootUri: "file:///library",
  dataSourceId: "local",
  libraryId: "library-1",
  backend: { kind: "local-direct" },
  sidecarStorage: { kind: "local-direct", root: "/library" },
} as SyncTargetContext

describe("syncMyReader", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest
      .mocked(syncLibrarySidecarDatabase)
      .mockResolvedValue({ pushed: 1, pulled: 1 })
    jest.mocked(invalidateReadingProgress).mockResolvedValue(undefined)
    jest.mocked(invalidateReadingStatistics).mockResolvedValue(undefined)
    jest.mocked(invalidateReaderAnnotations).mockResolvedValue(undefined)
    jest.mocked(invalidateReaderBookmarks).mockResolvedValue(undefined)
    jest.mocked(invalidateRecentlyReadBooks).mockResolvedValue(undefined)
    jest.mocked(invalidateFavoriteBooks).mockResolvedValue(undefined)
  })

  it("should use the library sidecar provider when full sync runs", async () => {
    const result = await syncMyReader(context)

    expect(syncLibrarySidecarDatabase).toHaveBeenCalledWith(
      context.library,
      expect.any(Number),
      "full",
      context.sidecarStorage,
    )
    expect(invalidateFavoriteBooks).toHaveBeenCalledWith(context.library.id)
    expect(invalidateReadingStatistics).toHaveBeenCalledWith(context.library.id)
    expect(invalidateReaderAnnotations).toHaveBeenCalledWith(context.library.id)
    expect(invalidateReaderBookmarks).toHaveBeenCalledWith(context.library.id)
    expect(result.providers).toEqual({
      "library-sidecar": { pushed: 1, pulled: 1 },
    })
  })

  it("should not pull remote changes when push-only sync runs", async () => {
    jest
      .mocked(syncLibrarySidecarDatabase)
      .mockResolvedValueOnce({ pushed: 1, pulled: 0 })
    const result = await syncMyReader(context, {
      myreaderMode: "push_only",
    })

    expect(syncLibrarySidecarDatabase).toHaveBeenCalledWith(
      context.library,
      expect.any(Number),
      "push_only",
      context.sidecarStorage,
    )
    expect(result.providers).toEqual({
      "library-sidecar": { pushed: 1, pulled: 0 },
    })
  })

  it("should wait for progress cache refresh when remote positions are pulled", async () => {
    let resolveInvalidation!: () => void
    let signalInvalidationStarted!: () => void
    const invalidationStarted = new Promise<void>((resolve) => {
      signalInvalidationStarted = resolve
    })
    const invalidationFinished = new Promise<void>((resolve) => {
      resolveInvalidation = resolve
    })
    jest.mocked(invalidateReadingProgress).mockImplementation(() => {
      signalInvalidationStarted()
      return invalidationFinished
    })

    let syncFinished = false
    const syncPromise = syncMyReader(context).then((result) => {
      syncFinished = true
      return result
    })

    await invalidationStarted
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(syncFinished).toBe(false)

    resolveInvalidation()
    await expect(syncPromise).resolves.toMatchObject({ skipped: false })
  })

  it("should preserve the original error when sidecar sync fails", async () => {
    const error = jest.spyOn(console, "error").mockImplementation()
    jest
      .mocked(syncLibrarySidecarDatabase)
      .mockRejectedValue(new Error("network unavailable"))

    const result = await syncMyReader(context)

    expect(result).toMatchObject({
      skipped: true,
      skipReason: "error",
      error: "network unavailable",
    })
    error.mockRestore()
  })
})
