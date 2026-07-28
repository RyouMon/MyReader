import { releaseSyncTask, syncLibrarySidecar } from "@/src/services/core/sync"
import { syncLibrarySidecarDatabase } from "./sync-database"

jest.mock("@/src/services/core/sync", () => ({
  readSyncTaskProgress: jest.fn(() => null),
  releaseSyncTask: jest.fn(),
  syncLibrarySidecar: jest.fn(),
}))

jest.mock("@/src/services/fs/library-paths", () => ({
  libraryRootUri: jest.fn(() => "file:///library"),
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

describe("syncLibrarySidecarDatabase", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.mocked(syncLibrarySidecar).mockResolvedValue({ pushed: 1, pulled: 2 })
  })

  it("should delegate complete library paths when sidecar sync runs", async () => {
    const report = await syncLibrarySidecarDatabase(
      library,
      100,
      "full",
      { kind: "local-direct", root: "/library" },
      { taskId: "task-1" },
    )

    expect(syncLibrarySidecar).toHaveBeenCalledWith({
      taskId: "task-1",
      sidecarRootPath: "/sidecar",
      libraryRootPath: "/library",
      nowMs: 100,
      mode: "full",
      storage: { kind: "local-direct", root: "/library" },
    })
    expect(releaseSyncTask).toHaveBeenCalledWith("task-1")
    expect(report).toEqual({ pushed: 1, pulled: 2 })
  })
})
