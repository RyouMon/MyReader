jest.mock("./sync-library", () => ({
  syncLibrary: jest.fn(),
}))

jest.mock("./hooks/apply-sync-report", () => ({
  applySyncReport: jest.fn(),
}))

jest.mock("./library-sidecar/automerge-store", () => ({
  hasPendingLibrarySidecarAutomergeChanges: jest.fn(),
}))

import type { DataSource, Library } from "../types"
import { applySyncReport } from "./hooks/apply-sync-report"
import { hasPendingLibrarySidecarAutomergeChanges } from "./library-sidecar/automerge-store"
import { syncLibrary } from "./sync-library"
import {
  createAutomaticSidecarSyncScheduler,
  recoverPendingSidecarWork,
} from "./automatic-sidecar-sync"

const library = {
  id: "library-1",
  name: "Library",
  path: "file:///library",
  addedAt: 0,
  bookCount: 1,
  sourceType: "local",
} as Library

const dataSources: DataSource[] = []

describe("automatic sidecar sync", () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.clearAllMocks()
    jest.mocked(syncLibrary).mockResolvedValue({
      libraryId: library.id,
      libraryName: library.name,
      durationMs: 1,
      calibre: {
        skipped: true,
        changed: false,
        library,
      },
      myreader: {
        skipped: false,
        mode: "push_only",
        providers: {},
      },
    })
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it("should sync only the sidecar when automatic work executes", async () => {
    const scheduler = createAutomaticSidecarSyncScheduler(() => ({
      libraries: [library],
      dataSources,
      enableAutoSync: true,
    }))

    scheduler.request({
      libraryId: library.id,
      mode: "push_only",
      reason: "local_change",
      timing: "immediate",
    })
    await jest.advanceTimersByTimeAsync(0)

    expect(syncLibrary).toHaveBeenCalledWith(library, dataSources, {
      scope: "myreader",
      myreaderMode: "push_only",
      throwOnFailure: true,
    })
    expect(applySyncReport).toHaveBeenCalled()
    scheduler.dispose()
  })

  it("should schedule only libraries with pending outbox when recovering", async () => {
    const otherLibrary = { ...library, id: "library-2", name: "Other" }
    jest
      .mocked(hasPendingLibrarySidecarAutomergeChanges)
      .mockImplementation(async (candidate) => candidate.id === library.id)
    const scheduler = createAutomaticSidecarSyncScheduler(() => ({
      libraries: [library, otherLibrary],
      dataSources,
      enableAutoSync: true,
    }))

    await recoverPendingSidecarWork(scheduler, [library, otherLibrary])
    await jest.advanceTimersByTimeAsync(0)

    expect(syncLibrary).toHaveBeenCalledTimes(1)
    expect(syncLibrary).toHaveBeenCalledWith(
      library,
      dataSources,
      expect.anything(),
    )
    scheduler.dispose()
  })
})
