jest.mock("my-reader-core", () => ({
  CoreFfiError: jest.requireActual(
    "../../../modules/my-reader-core/src/generated/my_reader_core_ffi",
  ).CoreFfiError,
  syncRunLibrary: jest.fn(),
}))

import { CoreFfiError, syncRunLibrary } from "my-reader-core"
import { DataIntegrityError } from "@/src/errors"
import { classifySyncFailure } from "@/src/domain/sync/failure"

import { syncLibraryData } from "./sync"

describe("core sync adapter", () => {
  it("should preserve data integrity error when native library sync rejects", async () => {
    const error = new CoreFfiError.DataIntegrity(
      "Remote object change.am is corrupt",
    )
    jest.mocked(syncRunLibrary).mockRejectedValue(error)

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
    ).rejects.toEqual(new DataIntegrityError(error.message, { cause: error }))
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

  it("should retain credential failures raised before a sync report exists", async () => {
    const nativeError = new CoreFfiError.Credential("network unavailable")
    jest.mocked(syncRunLibrary).mockRejectedValue(nativeError)

    const error: unknown = await syncLibraryData({
      taskId: "task-credential",
      configPath: "/app/config.json",
      sidecarRootPath: "/sidecar",
      libraryRootPath: "/library",
      libraryId: "library-1",
      nowMs: 100,
      scope: "all",
      forceCalibre: false,
      mode: "full",
      storage: { kind: "local-direct", root: "/library" },
    }).catch((error: unknown) => error)

    expect(classifySyncFailure(error)).toBe("credential")
    expect((error as Error).cause).toBe(nativeError)
  })
})
