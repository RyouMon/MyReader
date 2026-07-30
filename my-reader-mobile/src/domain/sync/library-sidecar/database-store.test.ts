jest.mock("./sync-database", () => ({
  ensureSyncDatabaseDocument: jest.fn(),
  executeSyncDatabaseCommand: jest.fn(),
  hasSyncDatabasePendingWork: jest.fn(),
  readSyncDatabaseDiagnostics: jest.fn(),
}))

import { subscribeLibrarySidecarWork } from "../sidecar-work"
import {
  commitLibrarySidecarMutation,
  ensureLibrarySidecarState,
  hasPendingLibrarySidecarChanges,
  readLibrarySidecarAutomergeDiagnosticSnapshot,
} from "./database-store"
import {
  ensureSyncDatabaseDocument,
  executeSyncDatabaseCommand,
  hasSyncDatabasePendingWork,
  readSyncDatabaseDiagnostics,
} from "./sync-database"

const library = {
  id: "library-1",
  name: "Library",
  path: "file:///library",
  addedAt: 0,
  bookCount: 1,
  sourceType: "local",
} as const

const identity = {
  libraryUuid: "11111111-2222-4333-8444-555555555555",
  replicaId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
}

const document = {
  heads: ["head-1"],
  projection: {
    readingPositions: [],
    readingPositionCandidates: [],
    favorites: [],
    bookmarks: [],
    annotations: [],
    readingSessions: [],
    readingCompletionRecords: [],
    readingCompletions: [],
  },
}

describe("library sidecar Rust database store", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.mocked(ensureSyncDatabaseDocument).mockResolvedValue(document)
    jest.mocked(executeSyncDatabaseCommand).mockResolvedValue({
      ...document,
      heads: ["head-2"],
    })
    jest.mocked(readSyncDatabaseDiagnostics).mockResolvedValue({
      schemaVersion: 1,
      heads: ["head-1"],
      changes: 1,
      pendingOutbox: 0,
      receipts: 2,
      projectionVersion: 1,
    })
  })

  it("should initialize state through the Rust database store when state is requested", async () => {
    await expect(ensureLibrarySidecarState(library, identity, 1)).resolves.toBe(
      document,
    )
    expect(ensureSyncDatabaseDocument).toHaveBeenCalledWith(
      library,
      identity,
      1,
    )
  })

  it("should report pending work when the durable outbox is not empty", async () => {
    jest.mocked(hasSyncDatabasePendingWork).mockResolvedValue(true)

    await expect(hasPendingLibrarySidecarChanges(library)).resolves.toBe(true)
  })

  it("should announce work when the Rust transaction commits a local mutation", async () => {
    const listener = jest.fn()
    const unsubscribe = subscribeLibrarySidecarWork(listener)

    await commitLibrarySidecarMutation(library, identity, 2, () => ({
      type: "setFavorite",
      bookId: 7,
      value: {
        isFavorite: true,
        addedAt: 2,
        recordedAt: 2,
        replicaId: identity.replicaId,
      },
    }))

    expect(listener).toHaveBeenCalledWith({
      libraryId: "library-1",
      reason: "local_change",
    })
    unsubscribe()
  })

  it("should not announce work when the Rust transaction fails", async () => {
    jest
      .mocked(executeSyncDatabaseCommand)
      .mockRejectedValueOnce(new Error("transaction failed"))
    const listener = jest.fn()
    const unsubscribe = subscribeLibrarySidecarWork(listener)

    await expect(
      commitLibrarySidecarMutation(library, identity, 2, () => ({
        type: "setFavorite",
        bookId: 7,
        value: {
          isFavorite: true,
          addedAt: 2,
          recordedAt: 2,
          replicaId: identity.replicaId,
        },
      })),
    ).rejects.toThrow("transaction failed")

    expect(listener).not.toHaveBeenCalled()
    unsubscribe()
  })

  it("should expose diagnostics returned by the Rust database store", async () => {
    await expect(
      readLibrarySidecarAutomergeDiagnosticSnapshot(library),
    ).resolves.toEqual({
      schemaVersion: 1,
      heads: ["head-1"],
      changes: 1,
      pendingOutbox: 0,
      receipts: 2,
      projectionVersion: 1,
    })
  })
})
