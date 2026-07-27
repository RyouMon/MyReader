jest.mock("./sync-database", () => ({
  applySyncDatabaseRemoteObjects: jest.fn(),
  ensureSyncDatabaseDocument: jest.fn(),
  executeSyncDatabaseCommand: jest.fn(),
  hasSyncDatabaseReceipt: jest.fn(),
  listSyncDatabaseOutbox: jest.fn(),
  markSyncDatabaseOutboxPublished: jest.fn(),
  readSyncDatabaseDiagnostics: jest.fn(),
}))

jest.mock("./automerge-binary", () => ({
  hashLibrarySidecarAutomergeBytes: jest.fn(),
}))

jest.mock("../background-sidecar-upload", () => ({
  uploadLibrarySidecarObject: jest.fn(),
}))

import { uploadLibrarySidecarObject } from "../background-sidecar-upload"
import { subscribeLibrarySidecarWork } from "../sidecar-work"
import { hashLibrarySidecarAutomergeBytes } from "./automerge-binary"
import {
  commitLibrarySidecarAutomergeMutation,
  ensureLibrarySidecarAutomergeState,
  hasPendingLibrarySidecarAutomergeChanges,
  publishLibrarySidecarAutomergeChanges,
  pullLibrarySidecarAutomergeChanges,
  readLibrarySidecarAutomergeDiagnosticSnapshot,
} from "./automerge-store"
import {
  applySyncDatabaseRemoteObjects,
  ensureSyncDatabaseDocument,
  executeSyncDatabaseCommand,
  hasSyncDatabaseReceipt,
  listSyncDatabaseOutbox,
  markSyncDatabaseOutboxPublished,
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
  schema: 1,
  libraryUuid: identity.libraryUuid,
  replicaId: identity.replicaId,
  snapshotBytes: new Uint8Array([1]),
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

describe("library sidecar Automerge store", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.mocked(ensureSyncDatabaseDocument).mockResolvedValue(document)
    jest.mocked(executeSyncDatabaseCommand).mockResolvedValue({
      ...document,
      heads: ["head-2"],
    })
    jest
      .mocked(hashLibrarySidecarAutomergeBytes)
      .mockResolvedValue("b".repeat(64))
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
    await expect(
      ensureLibrarySidecarAutomergeState(library, identity, 1),
    ).resolves.toBe(document)
    expect(ensureSyncDatabaseDocument).toHaveBeenCalledWith(
      library,
      identity,
      1,
    )
  })

  it("should expose local sync metadata when diagnostics are read", async () => {
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

  it("should report pending work when the durable outbox is not empty", async () => {
    jest.mocked(listSyncDatabaseOutbox).mockResolvedValue([
      {
        objectPath: ".myreader/automerge/changes/actor/change.am",
        bytes: new Uint8Array([1]),
        sha256: "a".repeat(64),
        changeHashesJson: `["${"b".repeat(64)}"]`,
      },
    ])

    await expect(
      hasPendingLibrarySidecarAutomergeChanges(library),
    ).resolves.toBe(true)
  })

  it("should announce work after the Rust transaction commits a local mutation", async () => {
    const listener = jest.fn()
    const unsubscribe = subscribeLibrarySidecarWork(listener)

    await commitLibrarySidecarAutomergeMutation(library, identity, 2, () => ({
      type: "inspect",
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
      commitLibrarySidecarAutomergeMutation(library, identity, 2, () => ({
        type: "inspect",
      })),
    ).rejects.toThrow("transaction failed")

    expect(listener).not.toHaveBeenCalled()
    unsubscribe()
  })

  it("should not publish different bytes when an immutable object already exists", async () => {
    const bytes = new Uint8Array([4])
    jest.mocked(listSyncDatabaseOutbox).mockResolvedValue([
      {
        objectPath:
          ".myreader/automerge/changes/actor/00000000000000000001-head.am",
        bytes,
        sha256: "b".repeat(64),
        changeHashesJson: '["head"]',
      },
    ])
    const backend = {
      listRemote: jest.fn().mockResolvedValue(["00000000000000000001-head.am"]),
      readBytes: jest.fn().mockResolvedValue(bytes),
      writeBytes: jest.fn(),
    } as never

    await publishLibrarySidecarAutomergeChanges(library, backend, 2)

    expect(
      (backend as { writeBytes: jest.Mock }).writeBytes,
    ).not.toHaveBeenCalled()
    expect(markSyncDatabaseOutboxPublished).toHaveBeenCalled()
  })

  it("should reuse remote bytes when publication confirmation fails", async () => {
    const bytes = new Uint8Array([4])
    const objectPath =
      ".myreader/automerge/changes/aaaaaaaaaaaa4aaa8aaaaaaaaaaaaaaa/" +
      `00000000000000000001-${"a".repeat(64)}.am`
    jest.mocked(listSyncDatabaseOutbox).mockResolvedValue([
      {
        objectPath,
        bytes,
        sha256: "b".repeat(64),
        changeHashesJson: `["${"a".repeat(64)}"]`,
      },
    ])
    jest
      .mocked(markSyncDatabaseOutboxPublished)
      .mockRejectedValueOnce(new Error("publish confirmation failed"))
      .mockResolvedValueOnce()
    const backend = {
      listRemote: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          objectPath.slice(objectPath.lastIndexOf("/") + 1),
        ]),
      readBytes: jest.fn().mockResolvedValue(bytes),
      writeBytes: jest.fn().mockResolvedValue(undefined),
    } as never

    await expect(
      publishLibrarySidecarAutomergeChanges(library, backend, 2),
    ).rejects.toThrow("publish confirmation failed")
    await expect(
      publishLibrarySidecarAutomergeChanges(library, backend, 3),
    ).resolves.toBe(1)

    expect(
      (backend as { writeBytes: jest.Mock }).writeBytes,
    ).toHaveBeenCalledTimes(1)
    expect(
      (backend as { readBytes: jest.Mock }).readBytes,
    ).toHaveBeenCalledWith(objectPath)
    expect(markSyncDatabaseOutboxPublished).toHaveBeenCalledTimes(2)
  })

  it("should use native background upload when a remote object is missing", async () => {
    const bytes = new Uint8Array([4])
    const objectPath =
      ".myreader/automerge/changes/aaaaaaaaaaaa4aaa8aaaaaaaaaaaaaaa/" +
      `00000000000000000001-${"a".repeat(64)}.am`
    jest.mocked(listSyncDatabaseOutbox).mockResolvedValue([
      {
        objectPath,
        bytes,
        sha256: "b".repeat(64),
        changeHashesJson: `["${"a".repeat(64)}"]`,
      },
    ])
    const backend = {
      kind: "onedrive",
      listRemote: jest.fn().mockResolvedValue([]),
      readBytes: jest.fn(),
      writeBytes: jest.fn(),
    } as never

    await publishLibrarySidecarAutomergeChanges(library, backend, 2)

    expect(uploadLibrarySidecarObject).toHaveBeenCalledWith(
      backend,
      objectPath,
      bytes,
    )
    expect(
      (backend as { writeBytes: jest.Mock }).writeBytes,
    ).not.toHaveBeenCalled()
  })

  it("should reject a remote object when its bytes exceed the input limit", async () => {
    jest.mocked(hasSyncDatabaseReceipt).mockResolvedValue(false)
    const actorId = "bbbbbbbbbbbb4bbb8bbbbbbbbbbbbbbb"
    const fileName = `00000000000000000001-${"c".repeat(64)}.am`
    const backend = {
      listRemote: jest
        .fn()
        .mockResolvedValueOnce([`${actorId}/`])
        .mockResolvedValueOnce([fileName]),
      readBytes: jest
        .fn()
        .mockResolvedValue(new Uint8Array(4 * 1024 * 1024 + 1)),
      writeBytes: jest.fn(),
    } as never

    await expect(
      pullLibrarySidecarAutomergeChanges(library, backend, identity, 2),
    ).rejects.toThrow("Remote Automerge object exceeds 4194304 bytes")
    expect(applySyncDatabaseRemoteObjects).not.toHaveBeenCalled()
  })
})
