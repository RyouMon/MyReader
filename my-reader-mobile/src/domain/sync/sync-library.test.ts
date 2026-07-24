jest.mock("./context", () => ({
  openSyncContext: jest.fn(),
}))

jest.mock("./connectivity", () => ({
  checkConnectivity: jest.fn(),
}))

jest.mock("./calibre-sync", () => ({
  syncCalibre: jest.fn(),
  skippedCalibre: jest.fn(),
}))

jest.mock("./myreader-sync", () => ({
  syncMyReader: jest.fn(),
  skippedMyreader: jest.fn(),
}))

jest.mock("./resolve", () => ({
  isRemoteBackend: jest.fn(),
}))

import type { DataSource, Library } from "../types"
import { SyncConnectivityError } from "@/src/errors"

import { skippedCalibre, syncCalibre } from "./calibre-sync"
import { checkConnectivity } from "./connectivity"
import { openSyncContext, type SyncTargetContext } from "./context"
import { skippedMyreader, syncMyReader } from "./myreader-sync"
import { DEFAULT_SYNC_POLICY } from "./policy"
import { isRemoteBackend } from "./resolve"
import { syncLibraries, syncLibrary } from "./sync-library"

const mockOpenSyncContext = openSyncContext as jest.MockedFunction<
  typeof openSyncContext
>
const mockCheckConnectivity = checkConnectivity as jest.MockedFunction<
  typeof checkConnectivity
>
const mockSyncCalibre = syncCalibre as jest.MockedFunction<typeof syncCalibre>
const mockSyncMyReader = syncMyReader as jest.MockedFunction<
  typeof syncMyReader
>
const mockSkippedCalibre = skippedCalibre as jest.MockedFunction<
  typeof skippedCalibre
>
const mockSkippedMyreader = skippedMyreader as jest.MockedFunction<
  typeof skippedMyreader
>
const mockIsRemoteBackend = isRemoteBackend as jest.MockedFunction<
  typeof isRemoteBackend
>

const library: Library = {
  id: "lib-1",
  name: "Test Library",
  path: "file:///tmp/lib",
  metadataUri: "file:///tmp/lib/metadata.db",
  bookCount: 1,
  addedAt: 0,
  dataSourceId: "local",
  sourceType: "local",
}

const dataSources: DataSource[] = []

const localCtx = {
  library,
  libraryRootUri: "file:///cache/lib-1",
  dataSourceId: "local",
  libraryId: library.id,
  backend: { kind: "local-direct" as const },
} as SyncTargetContext

const remoteCtx = {
  ...localCtx,
  backend: { kind: "webdav" as const },
} as SyncTargetContext

function calibreResult(changed = true) {
  return {
    skipped: false,
    changed,
    library,
  }
}

function myreaderResult(mode: "full" | "push_only" = "full") {
  return {
    skipped: false,
    mode,
    providers: { reading_progress: { pushed: 1, pulled: 0 } },
  }
}

describe("syncLibrary", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockOpenSyncContext.mockResolvedValue(localCtx)
    mockIsRemoteBackend.mockReturnValue(false)
    mockSyncCalibre.mockResolvedValue(calibreResult())
    mockSyncMyReader.mockResolvedValue(myreaderResult())
    mockSkippedCalibre.mockReturnValue({
      skipped: true,
      skipReason: "not_applicable",
      changed: false,
      library,
    })
    mockSkippedMyreader.mockReturnValue({
      skipped: true,
      skipReason: "not_applicable",
      mode: "full",
      providers: {},
    })
  })

  test("should run both phases when scope is all", async () => {
    const report = await syncLibrary(library, dataSources, { scope: "all" })

    expect(mockSyncCalibre).toHaveBeenCalledTimes(1)
    expect(mockSyncMyReader).toHaveBeenCalledTimes(1)
    expect(mockSkippedCalibre).not.toHaveBeenCalled()
    expect(mockSkippedMyreader).not.toHaveBeenCalled()
    expect(report.calibre.changed).toBe(true)
    expect(report.myreader.skipped).toBe(false)
  })

  it("should pass refreshed library metadata when MyReader sync follows Calibre", async () => {
    const refreshed = {
      ...library,
      metadataUri: "file:///tmp/lib/refreshed-metadata.db",
    }
    mockSyncCalibre.mockResolvedValue({
      skipped: false,
      changed: true,
      library: refreshed,
    })

    await syncLibrary(library, dataSources, { scope: "all" })

    expect(mockSyncMyReader).toHaveBeenCalledWith(
      { ...localCtx, library: refreshed },
      expect.any(Object),
    )
  })

  test("should skip myreader when scope is calibre", async () => {
    await syncLibrary(library, dataSources, { scope: "calibre" })

    expect(mockSyncCalibre).toHaveBeenCalledTimes(1)
    expect(mockSyncMyReader).not.toHaveBeenCalled()
    expect(mockSkippedMyreader).toHaveBeenCalledWith("full")
  })

  test("should skip calibre when scope is myreader", async () => {
    await syncLibrary(library, dataSources, {
      scope: "myreader",
      myreaderMode: "push_only",
    })

    expect(mockSyncCalibre).not.toHaveBeenCalled()
    expect(mockSkippedCalibre).toHaveBeenCalledWith(library)
    expect(mockSyncMyReader).toHaveBeenCalledWith(
      localCtx,
      expect.objectContaining({ myreaderMode: "push_only" }),
    )
  })

  test("should pass forceCalibre when syncing calibre", async () => {
    await syncLibrary(library, dataSources, {
      scope: "calibre",
      forceCalibre: true,
    })

    expect(mockSyncCalibre).toHaveBeenCalledWith(
      localCtx,
      dataSources,
      expect.objectContaining({ forceCalibre: true }),
    )
  })

  test("should skip connectivity check when backend is local", async () => {
    await syncLibrary(library, dataSources)

    expect(mockIsRemoteBackend).toHaveBeenCalledWith(localCtx.backend)
    expect(mockCheckConnectivity).not.toHaveBeenCalled()
  })

  test("should return connectivity failure when remote backend is unreachable", async () => {
    mockOpenSyncContext.mockResolvedValue(remoteCtx)
    mockIsRemoteBackend.mockReturnValue(true)
    mockCheckConnectivity.mockResolvedValue({
      reachable: false,
      latencyMs: 0,
      error: "offline",
    })

    const report = await syncLibrary(library, dataSources, {
      throwOnFailure: false,
    })

    expect(mockCheckConnectivity).toHaveBeenCalledWith(remoteCtx.backend)
    expect(mockSyncCalibre).not.toHaveBeenCalled()
    expect(mockSyncMyReader).not.toHaveBeenCalled()
    expect(report.error).toBe("offline")
    expect(report.calibre.skipReason).toBe("connectivity")
    expect(report.myreader.skipped).toBe(true)
  })

  test("should return skipped report when sync context cannot open", async () => {
    mockOpenSyncContext.mockRejectedValue(new Error("missing metadata"))

    const report = await syncLibrary(library, dataSources, {
      myreaderMode: "push_only",
    })

    expect(report).toMatchObject({
      libraryId: "lib-1",
      error: "missing metadata",
      calibre: {
        skipped: true,
        skipReason: "error",
        error: "missing metadata",
      },
    })
    expect(mockSkippedMyreader).toHaveBeenCalledWith("push_only")
    expect(mockSyncCalibre).not.toHaveBeenCalled()
    expect(mockSyncMyReader).not.toHaveBeenCalled()
  })

  test("should throw context open failures when requested", async () => {
    mockOpenSyncContext.mockRejectedValue("metadata unavailable")

    await expect(
      syncLibrary(library, dataSources, { throwOnFailure: true }),
    ).rejects.toThrow("metadata unavailable")
  })

  test("should throw typed connectivity failure when requested", async () => {
    mockOpenSyncContext.mockResolvedValue(remoteCtx)
    mockIsRemoteBackend.mockReturnValue(true)
    mockCheckConnectivity.mockResolvedValue({
      reachable: false,
      latencyMs: 0,
    })

    await expect(
      syncLibrary(library, dataSources, { throwOnFailure: true }),
    ).rejects.toBeInstanceOf(SyncConnectivityError)
  })

  test("should throw calibre phase errors when requested", async () => {
    mockSyncCalibre.mockResolvedValue({
      ...calibreResult(false),
      error: "calibre failed",
    })

    await expect(
      syncLibrary(library, dataSources, { throwOnFailure: true }),
    ).rejects.toThrow("calibre failed")
  })

  test("should throw myreader phase errors when requested", async () => {
    mockSyncMyReader.mockResolvedValue({
      ...myreaderResult(),
      error: "myreader failed",
    })

    await expect(
      syncLibrary(library, dataSources, { throwOnFailure: true }),
    ).rejects.toThrow("myreader failed")
  })
})

describe("syncLibraries", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockOpenSyncContext.mockResolvedValue(localCtx)
    mockIsRemoteBackend.mockReturnValue(false)
    mockSyncCalibre.mockResolvedValue(calibreResult())
    mockSyncMyReader.mockResolvedValue(myreaderResult())
    mockSkippedCalibre.mockReturnValue({
      skipped: true,
      skipReason: "not_applicable",
      changed: false,
      library,
    })
    mockSkippedMyreader.mockReturnValue({
      skipped: true,
      skipReason: "not_applicable",
      mode: "full",
      providers: {},
    })
  })

  test("should abort startup sync when syncOnStartup is disabled", async () => {
    const report = await syncLibraries(
      {
        libraries: [library],
        dataSources,
        activeLibraryId: library.id,
        syncOnStartup: false,
        enableAutoSync: true,
      },
      "startup",
    )

    expect(report.aborted).toBe(true)
    expect(report.results).toHaveLength(0)
    expect(mockOpenSyncContext).not.toHaveBeenCalled()
  })

  test("should abort scheduled sync when auto sync is disabled", async () => {
    const report = await syncLibraries(
      {
        libraries: [library],
        dataSources,
        activeLibraryId: library.id,
        syncOnStartup: true,
        enableAutoSync: false,
      },
      "scheduled",
    )

    expect(report.aborted).toBe(true)
    expect(report.results).toHaveLength(0)
    expect(mockOpenSyncContext).not.toHaveBeenCalled()
  })

  test("should abort sync when trigger policy is disabled", async () => {
    const report = await syncLibraries(
      {
        libraries: [library],
        dataSources,
        activeLibraryId: library.id,
        syncOnStartup: true,
        enableAutoSync: true,
      },
      "manual",
      {
        ...DEFAULT_SYNC_POLICY,
        manual: { ...DEFAULT_SYNC_POLICY.manual, enabled: false },
      },
    )

    expect(report.aborted).toBe(true)
    expect(report.results).toHaveLength(0)
    expect(mockOpenSyncContext).not.toHaveBeenCalled()
  })

  test("should target only active library when scheduled reading sync runs", async () => {
    const otherLibrary: Library = { ...library, id: "lib-2", name: "Other" }

    await syncLibraries(
      {
        libraries: [library, otherLibrary],
        dataSources,
        activeLibraryId: library.id,
        syncOnStartup: true,
        enableAutoSync: true,
      },
      "scheduled",
      undefined,
      "reading",
    )

    expect(mockOpenSyncContext).toHaveBeenCalledTimes(1)
    expect(mockOpenSyncContext).toHaveBeenCalledWith(library, dataSources)
    expect(mockSyncMyReader).toHaveBeenCalledWith(
      localCtx,
      expect.objectContaining({ myreaderMode: "push_only" }),
    )
    expect(mockSyncCalibre).not.toHaveBeenCalled()
  })
})
