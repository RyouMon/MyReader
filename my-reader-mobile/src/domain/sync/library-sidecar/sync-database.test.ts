jest.mock("@/modules/myreader-rust-components", () => ({
  __esModule: true,
  default: {
    syncContractVersion: jest.fn(() => 7),
    ensureSyncDatabaseIdentity: jest.fn(),
    ensureSyncDatabaseDocument: jest.fn(),
    executeSyncDatabaseCommand: jest.fn(),
    readSyncTaskProgress: jest.fn(),
    cancelSyncTask: jest.fn(),
    releaseSyncTask: jest.fn(),
    syncLibrarySidecar: jest.fn(),
  },
}))

jest.mock("@/src/services/db/library-db", () => ({
  getLibraryDatabase: jest.fn(),
}))

import type { Library } from "@my-reader/tools/types/library"

import MyReaderRustComponents from "@/modules/myreader-rust-components"
import { getLibraryDatabase } from "@/src/services/db/library-db"
import {
  ensureSyncDatabaseDocument,
  ensureSyncDatabaseIdentity,
  executeSyncDatabaseCommand,
  syncLibrarySidecarDatabase,
} from "./sync-database"

const library = { id: "library-1" } as Library
const identity = {
  libraryUuid: "11111111-2222-4333-8444-555555555555",
  replicaId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
}
const nativeResult = {
  schemaVersion: 1,
  heads: ["head-1"],
  projectionJson: JSON.stringify({
    readingPositions: [],
    readingPositionCandidates: [],
    favorites: [],
    bookmarks: [],
    annotations: [],
    readingSessions: [],
    readingCompletionRecords: [],
    readingCompletions: [],
  }),
}

describe("sync database adapter", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.mocked(getLibraryDatabase).mockResolvedValue({
      path: "/library/.myreader/myreader.db",
    } as never)
    jest
      .mocked(MyReaderRustComponents.ensureSyncDatabaseIdentity)
      .mockResolvedValue(identity)
    jest
      .mocked(MyReaderRustComponents.ensureSyncDatabaseDocument)
      .mockResolvedValue(nativeResult)
    jest
      .mocked(MyReaderRustComponents.executeSyncDatabaseCommand)
      .mockResolvedValue(nativeResult)
    jest
      .mocked(MyReaderRustComponents.syncLibrarySidecar)
      .mockResolvedValue({ pushed: 2, pulled: 1 })
    jest
      .mocked(MyReaderRustComponents.readSyncTaskProgress)
      .mockReturnValue(null)
    jest.mocked(MyReaderRustComponents.releaseSyncTask).mockReturnValue(true)
  })

  it("should delegate replica identity ownership when library identity is known", async () => {
    await expect(
      ensureSyncDatabaseIdentity(library, identity.libraryUuid),
    ).resolves.toEqual(identity)

    expect(
      MyReaderRustComponents.ensureSyncDatabaseIdentity,
    ).toHaveBeenCalledWith(
      "/library/.myreader/myreader.db",
      identity.libraryUuid,
    )
  })

  it("should pass the migrated library database path when state is ensured", async () => {
    await ensureSyncDatabaseDocument(library, identity, 100)

    expect(
      MyReaderRustComponents.ensureSyncDatabaseDocument,
    ).toHaveBeenCalledWith(
      "/library/.myreader/myreader.db",
      identity.libraryUuid,
      identity.replicaId,
      "100",
    )
  })

  it("should encode one domain command when a local mutation is executed", async () => {
    await executeSyncDatabaseCommand(library, identity, 200, {
      type: "setFavorite",
      bookId: 42,
      value: {
        isFavorite: true,
        addedAt: 200,
        recordedAt: 200,
        replicaId: identity.replicaId,
      },
    })

    expect(
      MyReaderRustComponents.executeSyncDatabaseCommand,
    ).toHaveBeenCalledWith(
      "/library/.myreader/myreader.db",
      identity.libraryUuid,
      identity.replicaId,
      "200",
      JSON.stringify({
        command: {
          type: "setFavorite",
          bookId: 42,
          value: {
            isFavorite: true,
            addedAt: 200,
            recordedAt: 200,
            replicaId: identity.replicaId,
          },
        },
      }),
    )
  })

  it("should delegate sidecar exchange to the Rust use case when sync runs", async () => {
    await expect(
      syncLibrarySidecarDatabase(
        library,
        identity,
        300,
        "full",
        {
          kind: "webdav",
          endpoint: "https://example.com/dav",
          username: "reader",
          password: "secret",
          root: "/books/library",
        },
        { taskId: "task-1" },
      ),
    ).resolves.toEqual({ pushed: 2, pulled: 1 })

    expect(MyReaderRustComponents.syncLibrarySidecar).toHaveBeenCalledWith(
      "task-1",
      "/library/.myreader/myreader.db",
      identity.libraryUuid,
      identity.replicaId,
      "300",
      "full",
      JSON.stringify({
        kind: "webdav",
        endpoint: "https://example.com/dav",
        username: "reader",
        password: "secret",
        root: "/books/library",
      }),
    )
    expect(MyReaderRustComponents.releaseSyncTask).toHaveBeenCalledWith(
      "task-1",
    )
  })

  it("should publish final native task progress before task state is released", async () => {
    jest.mocked(MyReaderRustComponents.readSyncTaskProgress).mockReturnValue({
      taskId: "task-1",
      stage: "complete",
      completed: 1,
      total: 1,
    })
    const onProgress = jest.fn()

    await syncLibrarySidecarDatabase(
      library,
      identity,
      300,
      "full",
      { kind: "local-direct", root: "/library" },
      { taskId: "task-1", onProgress },
    )

    expect(onProgress).toHaveBeenCalledWith({
      taskId: "task-1",
      libraryId: "library-1",
      stage: "complete",
      completed: 1,
      total: 1,
    })
  })
})
