import {
  recoverCoordinatedSync,
  requestCoordinatedPull,
} from "@/src/services/core/sync"
import { createSidecarSyncRuntime } from "./sidecar-sync-runtime"

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
  beginCoordinatedSync: jest.fn(),
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
})
