import MyReaderRustComponents from "@/modules/myreader-rust-components"
import { createSidecarSyncRuntime } from "./sidecar-sync-runtime"

jest.mock("@/modules/myreader-rust-components", () => ({
  __esModule: true,
  default: {
    createSyncCoordinator: jest.fn(() => true),
    requestCoordinatedSync: jest.fn(() =>
      JSON.stringify({
        schedules: [],
        cancelTimersFor: [],
        execution: null,
      }),
    ),
    flushCoordinatedSync: jest.fn(),
    recoverCoordinatedSync: jest.fn(),
    requestCoordinatedPull: jest.fn(),
    beginCoordinatedSync: jest.fn(),
    effectiveCoordinatedSyncExecution: jest.fn(),
    completeCoordinatedSync: jest.fn(),
    failCoordinatedSync: jest.fn(),
    setCoordinatedSyncLibraryOnline: jest.fn(),
    disposeSyncCoordinator: jest.fn(() =>
      JSON.stringify({
        schedules: [],
        cancelTimersFor: [],
        execution: null,
      }),
    ),
    cancelSyncTask: jest.fn(),
  },
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
    jest
      .mocked(MyReaderRustComponents.requestCoordinatedPull)
      .mockResolvedValue(
        JSON.stringify({
          schedules: [
            { libraryId: "library-1", generation: 1, deadline: Date.now() },
          ],
          cancelTimersFor: [],
          execution: null,
        }),
      )
    const runtime = createSidecarSyncRuntime(() => ({
      libraries: [library],
      dataSources: [],
      enableAutoSync: true,
    }))

    await expect(
      runtime.requestContextualPull("library-1", "app_foregrounded"),
    ).resolves.toBe(true)

    expect(MyReaderRustComponents.requestCoordinatedPull).toHaveBeenCalledWith(
      expect.stringMatching(/^mobile:/),
      "/sidecar",
      "library-1",
      "app_foregrounded",
      expect.any(String),
      "30000",
    )
    runtime.dispose()
  })

  it("should restore durable work when runtime starts", async () => {
    jest
      .mocked(MyReaderRustComponents.recoverCoordinatedSync)
      .mockResolvedValue(
        JSON.stringify({
          schedules: [],
          cancelTimersFor: [],
          execution: null,
        }),
      )
    const runtime = createSidecarSyncRuntime(() => ({
      libraries: [library],
      dataSources: [],
      enableAutoSync: true,
    }))

    await runtime.recover()

    expect(MyReaderRustComponents.recoverCoordinatedSync).toHaveBeenCalledWith(
      expect.stringMatching(/^mobile:/),
      "/sidecar",
      "library-1",
      expect.any(String),
    )
    runtime.dispose()
  })
})
