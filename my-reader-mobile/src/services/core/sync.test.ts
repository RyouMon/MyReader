jest.mock("my-reader-core", () => ({
  CoreFfiError: {
    DataIntegrity: {
      instanceOf: (error: unknown) =>
        (error as { tag?: string }).tag === "DataIntegrity",
    },
  },
  syncRunLibrary: jest.fn(),
}))

import { syncRunLibrary } from "my-reader-core"
import { DataIntegrityError } from "@/src/errors"

import { syncLibraryData } from "./sync"

describe("core sync adapter", () => {
  it("should preserve data integrity error when native library sync rejects", async () => {
    jest.mocked(syncRunLibrary).mockRejectedValue({
      tag: "DataIntegrity",
      message: "Remote object change.am is corrupt",
    })

    await expect(
      syncLibraryData({
        taskId: "task-1",
        configPath: "/app/config.json",
        sidecarRootPath: "/sidecar",
        libraryRootPath: "/library",
        libraryId: "library-1",
        nowMs: 100,
        scope: "all",
        forceCalibre: false,
        mode: "full",
        storage: { kind: "local-direct", root: "/library" },
      }),
    ).rejects.toEqual(
      new DataIntegrityError("Remote object change.am is corrupt"),
    )
  })

  it("should pass an explicit full sync contract when library data is synced", async () => {
    jest.mocked(syncRunLibrary).mockResolvedValue({
      libraryId: "library-1",
      libraryName: "Library",
      durationMs: 20,
      error: undefined,
      failureKind: undefined,
      calibre: {
        skipped: false,
        skipReason: undefined,
        changed: true,
        library: {
          id: "library-1",
          name: "Library",
          path: "file:///library",
          libraryType: "calibre",
          bookCount: 2,
          metadataUri: "file:///library/metadata.db",
        },
        error: undefined,
      },
      myreader: {
        skipped: false,
        skipReason: undefined,
        mode: "full",
        pushed: 1,
        pulled: 2,
        error: undefined,
        failureKind: undefined,
      },
    })

    await syncLibraryData({
      taskId: "task-1",
      configPath: "/app/config.json",
      sidecarRootPath: "/sidecar",
      libraryRootPath: "/library",
      libraryId: "library-1",
      nowMs: 100,
      scope: "all",
      forceCalibre: false,
      mode: "full",
      storage: { kind: "local-direct", root: "/library" },
    })

    expect(syncRunLibrary).toHaveBeenCalledWith(
      "task-1",
      "/app/config.json",
      "/sidecar",
      "/library",
      "library-1",
      100,
      "all",
      false,
      "full",
      { kind: "local-direct", root: "/library" },
    )
  })
})
