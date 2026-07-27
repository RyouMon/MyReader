jest.mock("./sync-library", () => ({
  syncLibrary: jest.fn(),
}))

jest.mock("./hooks/apply-sync-report", () => ({
  applySyncReport: jest.fn(),
}))

jest.mock("./library-sidecar/automerge-store", () => ({
  hasPendingLibrarySidecarAutomergeChanges: jest.fn(),
}))

jest.mock("@/src/repos/library-sidecar-schedule", () => ({
  readLibrarySidecarScheduleState: jest.fn(),
  writeLibrarySidecarScheduleState: jest.fn(),
}))

import type { DataSource, Library } from "../types"
import {
  readLibrarySidecarScheduleState,
  writeLibrarySidecarScheduleState,
} from "@/src/repos/library-sidecar-schedule"
import { applySyncReport } from "./hooks/apply-sync-report"
import { hasPendingLibrarySidecarAutomergeChanges } from "./library-sidecar/automerge-store"
import { syncLibrary } from "./sync-library"
import {
  createAutomaticSidecarSyncScheduler,
  recoverPendingSidecarWork,
  startSidecarPullSafetySweep,
  shouldPullLibrarySidecar,
} from "./automatic-sidecar-sync"
import type { SidecarSyncScheduler } from "./sidecar-scheduler"

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
    jest.mocked(readLibrarySidecarScheduleState).mockResolvedValue(null)
    jest.mocked(writeLibrarySidecarScheduleState).mockResolvedValue()
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

  it("should skip contextual pull when the last pull is still fresh", async () => {
    jest.mocked(readLibrarySidecarScheduleState).mockResolvedValue({
      lastSuccessfulPullAt: 90_000,
      nextRetryAt: null,
      transientFailureCount: 0,
      suspendedReason: null,
    })

    await expect(
      shouldPullLibrarySidecar(library, 100_000, 30_000),
    ).resolves.toBe(false)
  })

  it("should allow contextual pull when no successful pull is recorded", async () => {
    jest.mocked(readLibrarySidecarScheduleState).mockResolvedValue(null)

    await expect(
      shouldPullLibrarySidecar(library, 100_000, 30_000),
    ).resolves.toBe(true)
  })

  it("should request a full pull when the active library reaches the jittered safety sweep", async () => {
    jest.setSystemTime(0)
    jest.mocked(readLibrarySidecarScheduleState).mockResolvedValue({
      lastSuccessfulPullAt: 0,
      nextRetryAt: null,
      transientFailureCount: 0,
      suspendedReason: null,
    })
    const request = jest.fn()
    const scheduler = {
      request,
      flushPending: jest.fn(),
      resume: jest.fn(),
      setOnline: jest.fn(),
      setLibraryOnline: jest.fn(),
      dispose: jest.fn(),
    } as SidecarSyncScheduler
    const stop = startSidecarPullSafetySweep({
      scheduler,
      getActiveLibrary: () => library,
      random: () => 0,
    })

    await jest.advanceTimersByTimeAsync(48_000 - 1)
    expect(request).not.toHaveBeenCalled()

    await jest.advanceTimersByTimeAsync(1)
    await jest.advanceTimersByTimeAsync(0)

    expect(request).toHaveBeenCalledWith({
      libraryId: library.id,
      mode: "full",
      reason: "recovery_sweep",
      timing: "immediate",
    })
    stop()
  })
})
