import {
  beginCoordinatedSync,
  completeCoordinatedSync,
  effectiveCoordinatedSyncExecution,
  recoverCoordinatedSync,
  requestCoordinatedSync,
  requestCoordinatedPull,
  type SchedulerTransition,
} from "@/src/services/core/sync"
import { applySyncReport } from "@/src/domain/sync/hooks/apply-sync-report"
import { createSidecarSyncRuntime } from "./sidecar-sync-runtime"
import { syncLibrary } from "./sync-library"

jest.mock("@/src/services/core/sync", () => ({
  createSyncCoordinator: jest.fn(() => true),
  requestCoordinatedSync: jest.fn(() => ({
    schedules: [],
    cancelTimersFor: [],
    execution: null,
    retry: null,
  })),
  flushCoordinatedSync: jest.fn(),
  recoverCoordinatedSync: jest.fn(),
  requestCoordinatedPull: jest.fn(),
  beginCoordinatedSync: jest.fn(() => ({
    schedules: [],
    cancelTimersFor: [],
    execution: null,
    retry: null,
  })),
  effectiveCoordinatedSyncExecution: jest.fn(),
  completeCoordinatedSync: jest.fn(),
  failCoordinatedSync: jest.fn(),
  setCoordinatedSyncLibraryOnline: jest.fn(),
  safetySweepDelayMs: jest.fn(() => 60_000),
  disposeSyncCoordinator: jest.fn(() => ({
    schedules: [],
    cancelTimersFor: [],
    execution: null,
    retry: null,
  })),
  cancelSyncTask: jest.fn(),
}))

jest.mock("@/src/services/fs/library-paths", () => ({
  librarySidecarRootUri: jest.fn(() => "file:///sidecar"),
}))

jest.mock("@/src/services/fs/path", () => ({
  toNativeFilesystemPath: jest.fn(() => "/sidecar"),
}))

jest.mock("./sync-library", () => ({
  syncLibrary: jest.fn(),
}))

jest.mock("@/src/domain/sync/hooks/apply-sync-report", () => ({
  applySyncReport: jest.fn(),
}))

const library = {
  id: "library-1",
  name: "Library",
  path: "file:///library",
  addedAt: 0,
  bookCount: 1,
  sourceType: "local",
} as const

describe("createSidecarSyncRuntime", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("should request the core-selected mode when contextual pull is needed", async () => {
    jest.mocked(requestCoordinatedPull).mockResolvedValue({
      schedules: [
        { libraryId: "library-1", generation: 1, deadline: Date.now() },
      ],
      cancelTimersFor: [],
      execution: null,
      retry: null,
    })
    const runtime = createSidecarSyncRuntime(() => ({
      libraries: [library],
      dataSources: [],
      enableAutoSync: true,
    }))

    await expect(
      runtime.requestContextualPull("library-1", "app_foregrounded"),
    ).resolves.toBe(true)

    expect(requestCoordinatedPull).toHaveBeenCalledWith({
      coordinatorId: expect.stringMatching(/^mobile:/),
      sidecarRootPath: "/sidecar",
      libraryId: "library-1",
      reason: "app_foregrounded",
      nowMs: expect.any(Number),
    })
    runtime.dispose()
  })

  it("should restore durable work when runtime starts", async () => {
    jest.mocked(recoverCoordinatedSync).mockResolvedValue({
      schedules: [],
      cancelTimersFor: [],
      execution: null,
      retry: null,
    })
    const runtime = createSidecarSyncRuntime(() => ({
      libraries: [library],
      dataSources: [],
      enableAutoSync: true,
    }))

    await runtime.recover()

    expect(recoverCoordinatedSync).toHaveBeenCalledWith({
      coordinatorId: expect.stringMatching(/^mobile:/),
      sidecarRootPath: "/sidecar",
      libraryId: "library-1",
      nowMs: expect.any(Number),
    })
    runtime.dispose()
  })

  it("should ignore a contextual pull completed after disposal", async () => {
    jest.useFakeTimers()
    let resolvePull!: (transition: SchedulerTransition) => void
    jest.mocked(requestCoordinatedPull).mockImplementationOnce(
      () =>
        new Promise<SchedulerTransition>((resolve) => {
          resolvePull = resolve
        }),
    )
    const runtime = createSidecarSyncRuntime(() => ({
      libraries: [library],
      dataSources: [],
      enableAutoSync: true,
    }))

    try {
      const pull = runtime.requestContextualPull(
        "library-1",
        "app_foregrounded",
      )
      runtime.dispose()
      resolvePull({
        schedules: [
          { libraryId: "library-1", generation: 1, deadline: Date.now() },
        ],
        cancelTimersFor: [],
        execution: null,
        retry: null,
      })

      await expect(pull).resolves.toBe(false)
      jest.runOnlyPendingTimers()
      expect(beginCoordinatedSync).not.toHaveBeenCalled()
    } finally {
      runtime.dispose()
      jest.useRealTimers()
    }
  })

  it("should stop recovering libraries after disposal", async () => {
    let resolveRecovery!: (transition: SchedulerTransition) => void
    jest
      .mocked(recoverCoordinatedSync)
      .mockImplementationOnce(
        () =>
          new Promise<SchedulerTransition>((resolve) => {
            resolveRecovery = resolve
          }),
      )
      .mockResolvedValue({
        schedules: [],
        cancelTimersFor: [],
        execution: null,
        retry: null,
      })
    const secondLibrary = { ...library, id: "library-2" }
    const runtime = createSidecarSyncRuntime(() => ({
      libraries: [library, secondLibrary],
      dataSources: [],
      enableAutoSync: true,
    }))

    const recovery = runtime.recover()
    runtime.dispose()
    resolveRecovery({
      schedules: [],
      cancelTimersFor: [],
      execution: null,
      retry: null,
    })

    await recovery
    expect(recoverCoordinatedSync).toHaveBeenCalledTimes(1)
  })

  it("should publish completed content when automatic sync is disabled", async () => {
    jest.useFakeTimers()
    const execution = {
      libraryId: "library-1",
      mode: "push_only" as const,
      reasons: ["content_ready"],
    }
    const emptyTransition: SchedulerTransition = {
      schedules: [],
      cancelTimersFor: [],
      execution: null,
      retry: null,
    }
    jest.mocked(requestCoordinatedSync).mockReturnValue({
      ...emptyTransition,
      schedules: [
        { libraryId: "library-1", generation: 1, deadline: Date.now() },
      ],
    })
    jest.mocked(beginCoordinatedSync).mockReturnValue({
      ...emptyTransition,
      execution,
    })
    jest.mocked(effectiveCoordinatedSyncExecution).mockResolvedValue(execution)
    jest.mocked(syncLibrary).mockResolvedValue({} as never)
    jest.mocked(applySyncReport).mockResolvedValue()
    jest.mocked(completeCoordinatedSync).mockReturnValue(emptyTransition)
    const runtime = createSidecarSyncRuntime(() => ({
      libraries: [library],
      dataSources: [],
      enableAutoSync: false,
    }))

    try {
      runtime.request("library-1", "push_only", "content_ready", "immediate")
      await jest.runAllTimersAsync()

      expect(syncLibrary).toHaveBeenCalledWith(
        library,
        [],
        expect.objectContaining({
          scope: "myreader",
          myreaderMode: "push_only",
        }),
      )
      expect(applySyncReport).toHaveBeenCalled()
    } finally {
      runtime.dispose()
      jest.useRealTimers()
    }
  })

  it("should keep ordinary automatic sync disabled for non-required work", async () => {
    jest.useFakeTimers()
    const emptyTransition: SchedulerTransition = {
      schedules: [],
      cancelTimersFor: [],
      execution: null,
      retry: null,
    }
    jest.mocked(requestCoordinatedSync).mockReturnValue({
      ...emptyTransition,
      schedules: [
        { libraryId: "library-1", generation: 1, deadline: Date.now() },
      ],
    })
    jest.mocked(beginCoordinatedSync).mockReturnValue({
      ...emptyTransition,
      execution: {
        libraryId: "library-1",
        mode: "push_only",
        reasons: ["local_change"],
      },
    })
    jest.mocked(completeCoordinatedSync).mockReturnValue(emptyTransition)
    const runtime = createSidecarSyncRuntime(() => ({
      libraries: [library],
      dataSources: [],
      enableAutoSync: false,
    }))

    try {
      runtime.request("library-1", "push_only", "local_change", "immediate")
      await jest.runAllTimersAsync()

      expect(syncLibrary).not.toHaveBeenCalled()
      expect(effectiveCoordinatedSyncExecution).not.toHaveBeenCalled()
      expect(completeCoordinatedSync).toHaveBeenCalled()
    } finally {
      runtime.dispose()
      jest.useRealTimers()
    }
  })
})
