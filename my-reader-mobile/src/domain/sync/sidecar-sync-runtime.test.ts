import MyReaderRustComponents from "@/modules/myreader-rust-components"
import { createSidecarSyncRuntime } from "./sidecar-sync-runtime"

jest.mock("@/modules/myreader-rust-components", () => ({
  __esModule: true,
  default: {
    advanceSyncScheduler: jest.fn(() =>
      JSON.stringify({
        state: {},
        transition: {
          schedules: [],
          cancelTimersFor: [],
          execution: null,
          retry: null,
        },
      }),
    ),
    effectiveSidecarSyncMode: jest.fn(),
    readSidecarSyncSchedule: jest.fn(),
    hasSidecarSyncPendingWork: jest.fn(),
    classifySidecarSyncFailure: jest.fn(() => "suspend"),
    recordSidecarSyncRetry: jest.fn(),
    recordSidecarSyncSuspension: jest.fn(),
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
      .mocked(MyReaderRustComponents.effectiveSidecarSyncMode)
      .mockResolvedValue("full")
    const runtime = createSidecarSyncRuntime(() => ({
      libraries: [library],
      dataSources: [],
      enableAutoSync: true,
    }))

    await expect(
      runtime.requestContextualPull("library-1", "app_foregrounded"),
    ).resolves.toBe(true)

    const request = JSON.parse(
      jest.mocked(MyReaderRustComponents.advanceSyncScheduler).mock
        .calls[0]![2],
    )
    expect(request).toMatchObject({
      type: "request",
      libraryId: "library-1",
      mode: "full",
      reason: "app_foregrounded",
      timing: "immediate",
    })
    runtime.dispose()
  })

  it("should restore durable work when runtime starts", async () => {
    jest
      .mocked(MyReaderRustComponents.readSidecarSyncSchedule)
      .mockResolvedValue({
        lastSuccessfulPullAt: 100,
        nextRetryAt: null,
        transientFailureCount: 0,
        suspendedReason: null,
      })
    jest
      .mocked(MyReaderRustComponents.hasSidecarSyncPendingWork)
      .mockResolvedValue(true)
    const runtime = createSidecarSyncRuntime(() => ({
      libraries: [library],
      dataSources: [],
      enableAutoSync: true,
    }))

    await runtime.recover()

    const events = jest
      .mocked(MyReaderRustComponents.advanceSyncScheduler)
      .mock.calls.map((call) => JSON.parse(call[2]))
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "restore",
          libraryId: "library-1",
        }),
        expect.objectContaining({
          type: "request",
          libraryId: "library-1",
          mode: "push_only",
        }),
      ]),
    )
    runtime.dispose()
  })
})
