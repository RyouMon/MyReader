import type { SyncTargetContext } from "./context"
import { ensureLibrarySidecarIdentity } from "./library-sidecar/identity"
import {
  ensureLibrarySidecarAutomergeState,
  publishLibrarySidecarAutomergeChanges,
  pullLibrarySidecarAutomergeChanges,
} from "./library-sidecar/automerge-store"
import { syncMyReader } from "./myreader-sync"
import {
  invalidateFavoriteBooks,
  invalidateReadingProgress,
  invalidateReadingStatistics,
  invalidateReaderAnnotations,
  invalidateReaderBookmarks,
  invalidateRecentlyReadBooks,
} from "@/src/services/query/invalidate-table"

jest.mock("./library-sidecar/identity", () => ({
  ensureLibrarySidecarIdentity: jest.fn(),
}))

jest.mock("./library-sidecar/automerge-store", () => ({
  ensureLibrarySidecarAutomergeState: jest.fn(),
  publishLibrarySidecarAutomergeChanges: jest.fn(),
  pullLibrarySidecarAutomergeChanges: jest.fn(),
}))

jest.mock("./library-sidecar/automerge-projection", () => ({
  projectLibrarySidecarAutomergeDocument: jest.fn(),
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
} as SyncTargetContext

describe("syncMyReader", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.mocked(ensureLibrarySidecarIdentity).mockResolvedValue({
      libraryUuid: "018f2f8d-980b-40ef-b72e-c6e86cb7cc28",
      replicaId: "018f2f8d-980b-40ef-b72e-c6e86cb7cc29",
    })
    jest
      .mocked(ensureLibrarySidecarAutomergeState)
      .mockResolvedValue({} as never)
    jest.mocked(publishLibrarySidecarAutomergeChanges).mockResolvedValue(1)
    jest.mocked(pullLibrarySidecarAutomergeChanges).mockResolvedValue(1)
    jest.mocked(invalidateReadingProgress).mockResolvedValue(undefined)
    jest.mocked(invalidateReadingStatistics).mockResolvedValue(undefined)
    jest.mocked(invalidateReaderAnnotations).mockResolvedValue(undefined)
    jest.mocked(invalidateReaderBookmarks).mockResolvedValue(undefined)
    jest.mocked(invalidateRecentlyReadBooks).mockResolvedValue(undefined)
    jest.mocked(invalidateFavoriteBooks).mockResolvedValue(undefined)
  })

  it("should use the library sidecar provider when full sync runs", async () => {
    const result = await syncMyReader(context)

    expect(ensureLibrarySidecarAutomergeState).toHaveBeenCalledWith(
      context.library,
      {
        libraryUuid: "018f2f8d-980b-40ef-b72e-c6e86cb7cc28",
        replicaId: "018f2f8d-980b-40ef-b72e-c6e86cb7cc29",
      },
      expect.any(Number),
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
    const result = await syncMyReader(context, {
      myreaderMode: "push_only",
    })

    expect(pullLibrarySidecarAutomergeChanges).not.toHaveBeenCalled()
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
})
