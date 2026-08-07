import {
  readSyncTaskProgress,
  readSyncTaskSidecarReport,
  releaseSyncTask,
  syncLibraryData,
  type LibrarySyncReport,
} from "@/src/services/core/sync"
import { runCoreLibrarySync } from "./core-sync"

jest.mock("@/src/services/core/app-config", () => ({
  appConfigPath: "/config.json",
}))

jest.mock("@/src/services/core/sync", () => ({
  cancelSyncTask: jest.fn(),
  readSyncTaskProgress: jest.fn(() => null),
  readSyncTaskSidecarReport: jest.fn(() => null),
  releaseSyncTask: jest.fn(),
  syncLibraryData: jest.fn(),
}))

jest.mock("@/src/services/fs/library-paths", () => ({
  librarySidecarRootUri: jest.fn(() => "file:///sidecar"),
}))

jest.mock("@/src/services/fs/path", () => ({
  toNativeFilesystemPath: jest.fn((uri: string) => uri.replace("file://", "")),
}))

const library = {
  id: "library-1",
  name: "Library",
  path: "file:///library",
  addedAt: 0,
  bookCount: 1,
  sourceType: "local",
} as const

const report: LibrarySyncReport = {
  libraryId: library.id,
  libraryName: library.name,
  durationMs: 12,
  calibre: {
    skipped: false,
    changed: true,
    library,
  },
  myreader: {
    skipped: false,
    mode: "full",
    pushed: 1,
    pulled: 2,
  },
}

describe("runCoreLibrarySync", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.mocked(syncLibraryData).mockResolvedValue(report)
  })

  it("should pass one explicit use-case contract when a library is synced", async () => {
    const result = await runCoreLibrarySync({
      library,
      libraryRootUri: "file:///resolved-library",
      nowMs: 100,
      scope: "all",
      forceCalibre: true,
      mode: "full",
      storage: { kind: "local-direct", root: "/library" },
      taskId: "task-1",
    })

    expect(syncLibraryData).toHaveBeenCalledWith({
      taskId: "task-1",
      configPath: "/config.json",
      sidecarRootPath: "/sidecar",
      libraryRootPath: "/resolved-library",
      libraryId: library.id,
      nowMs: 100,
      scope: "all",
      forceCalibre: true,
      mode: "full",
      storage: { kind: "local-direct", root: "/library" },
    })
    expect(releaseSyncTask).toHaveBeenCalledWith("task-1")
    expect(result).toBe(report)
  })

  it("should publish the sidecar result while the Calibre phase is still running", async () => {
    jest.useFakeTimers()
    let finishSync: ((value: LibrarySyncReport) => void) | undefined
    jest.mocked(syncLibraryData).mockImplementation(
      () =>
        new Promise((resolve) => {
          finishSync = resolve
        }),
    )
    const onSidecarComplete = jest.fn()
    const pending = runCoreLibrarySync({
      library,
      libraryRootUri: "file:///resolved-library",
      nowMs: 100,
      scope: "all",
      forceCalibre: false,
      mode: "full",
      storage: { kind: "local-direct", root: "/library" },
      taskId: "task-1",
      onSidecarComplete,
    })

    jest
      .mocked(readSyncTaskSidecarReport)
      .mockReturnValue({ pushed: 1, pulled: 2 })
    jest.advanceTimersByTime(100)

    expect(onSidecarComplete).toHaveBeenCalledWith({ pushed: 1, pulled: 2 })
    expect(finishSync).toBeDefined()
    finishSync?.(report)
    await pending
    jest.useRealTimers()
  })

  it("should publish changed Core progress while the task is running", async () => {
    jest.useFakeTimers()
    let finishSync: ((value: LibrarySyncReport) => void) | undefined
    jest.mocked(syncLibraryData).mockImplementation(
      () =>
        new Promise((resolve) => {
          finishSync = resolve
        }),
    )
    const onProgress = jest.fn()
    const pending = runCoreLibrarySync({
      library,
      libraryRootUri: "file:///resolved-library",
      nowMs: 100,
      scope: "all",
      forceCalibre: false,
      mode: "full",
      storage: { kind: "local-direct", root: "/library" },
      taskId: "task-1",
      onProgress,
    })

    jest.mocked(readSyncTaskProgress).mockReturnValue({
      taskId: "task-1",
      stage: "pulling",
      completed: 2,
      total: 5,
    })
    jest.advanceTimersByTime(100)
    jest.advanceTimersByTime(100)

    expect(onProgress).toHaveBeenCalledTimes(1)
    expect(onProgress).toHaveBeenCalledWith({
      taskId: "task-1",
      stage: "pulling",
      completed: 2,
      total: 5,
    })
    finishSync?.(report)
    await pending
    jest.useRealTimers()
  })
})
