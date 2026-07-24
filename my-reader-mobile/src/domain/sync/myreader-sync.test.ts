import type { SyncTargetContext } from "./context"
import {
  publishLibrarySidecarSegments,
  pullLibrarySidecarSegments,
} from "./library-sidecar/kernel"
import { ensureLibrarySidecarIdentity } from "./library-sidecar/identity"
import { syncMyReader } from "./myreader-sync"
import {
  invalidateFavoriteBooks,
  invalidateReadingProgress,
  invalidateRecentlyReadBooks,
} from "@/src/services/query/invalidate-table"

jest.mock("./library-sidecar/kernel", () => ({
  publishLibrarySidecarSegments: jest.fn(),
  pullLibrarySidecarSegments: jest.fn(),
}))

jest.mock("./library-sidecar/identity", () => ({
  ensureLibrarySidecarIdentity: jest.fn(),
}))

jest.mock("./library-sidecar/projection", () => ({
  applyLibrarySidecarSegment: jest.fn(),
}))

jest.mock("@/src/services/query/invalidate-table", () => ({
  invalidateFavoriteBooks: jest.fn(),
  invalidateReadingProgress: jest.fn(),
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
    jest.mocked(publishLibrarySidecarSegments).mockResolvedValue(2)
    jest.mocked(pullLibrarySidecarSegments).mockResolvedValue(3)
    jest.mocked(invalidateReadingProgress).mockResolvedValue(undefined)
    jest.mocked(invalidateRecentlyReadBooks).mockResolvedValue(undefined)
    jest.mocked(invalidateFavoriteBooks).mockResolvedValue(undefined)
  })

  it("should use the library sidecar provider when full sync runs", async () => {
    const result = await syncMyReader(context)

    expect(publishLibrarySidecarSegments).toHaveBeenCalledWith(
      context.library,
      context.backend,
      expect.any(Number),
    )
    expect(pullLibrarySidecarSegments).toHaveBeenCalled()
    expect(invalidateFavoriteBooks).toHaveBeenCalledWith(context.library.id)
    expect(result.providers).toEqual({
      "library-sidecar.v4": { pushed: 2, pulled: 3 },
    })
  })

  it("should not pull remote segments when push-only sync runs", async () => {
    const result = await syncMyReader(context, {
      myreaderMode: "push_only",
    })

    expect(publishLibrarySidecarSegments).toHaveBeenCalled()
    expect(pullLibrarySidecarSegments).not.toHaveBeenCalled()
    expect(result.providers).toEqual({
      "library-sidecar.v4": { pushed: 2, pulled: 0 },
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
