jest.mock("@/src/repos/library-sidecar-automerge", () => ({
  hasLibrarySidecarAutomergeReceipt: jest.fn(),
  insertLibrarySidecarAutomergeChange: jest.fn(),
  insertLibrarySidecarAutomergeOutbox: jest.fn(),
  insertLibrarySidecarAutomergeReceipt: jest.fn(),
  listPendingLibrarySidecarAutomergeOutbox: jest.fn(),
  markLibrarySidecarAutomergeOutboxPublished: jest.fn(),
  readLibrarySidecarAutomergeDiagnostics: jest.fn(),
  readLibrarySidecarAutomergeState: jest.fn(),
  writeLibrarySidecarAutomergeProjectionMeta: jest.fn(),
  writeLibrarySidecarAutomergeState: jest.fn(),
}))

jest.mock("@/src/repos/library-sidecar-sync", () => ({
  withLibrarySidecarSyncTransaction: jest.fn(),
}))

jest.mock("./automerge-binary", () => ({
  hashLibrarySidecarAutomergeBytes: jest.fn(),
}))

jest.mock("./automerge-document", () => ({
  applyLibrarySidecarIncremental: jest.fn(),
  assertLibrarySidecarIdentity: jest.fn(),
  createLibrarySidecarDocument: jest.fn(),
  librarySidecarChangesSince: jest.fn(),
  librarySidecarDocumentHeads: jest.fn(),
  librarySidecarMissingDependencies: jest.fn(),
  loadLibrarySidecarDocument: jest.fn(),
  saveLibrarySidecarDocument: jest.fn(),
  saveLibrarySidecarIncremental: jest.fn(),
  setLibrarySidecarIdentity: jest.fn(),
}))

import {
  hasLibrarySidecarAutomergeReceipt,
  insertLibrarySidecarAutomergeChange,
  insertLibrarySidecarAutomergeOutbox,
  listPendingLibrarySidecarAutomergeOutbox,
  markLibrarySidecarAutomergeOutboxPublished,
  readLibrarySidecarAutomergeDiagnostics,
  readLibrarySidecarAutomergeState,
  writeLibrarySidecarAutomergeProjectionMeta,
  writeLibrarySidecarAutomergeState,
} from "@/src/repos/library-sidecar-automerge"
import { withLibrarySidecarSyncTransaction } from "@/src/repos/library-sidecar-sync"
import { hashLibrarySidecarAutomergeBytes } from "./automerge-binary"
import {
  createLibrarySidecarDocument,
  librarySidecarChangesSince,
  librarySidecarDocumentHeads,
  loadLibrarySidecarDocument,
  saveLibrarySidecarDocument,
  saveLibrarySidecarIncremental,
  setLibrarySidecarIdentity,
} from "./automerge-document"
import {
  ensureLibrarySidecarAutomergeState,
  publishLibrarySidecarAutomergeChanges,
  pullLibrarySidecarAutomergeChanges,
  readLibrarySidecarAutomergeDiagnosticSnapshot,
} from "./automerge-store"

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

describe("library sidecar Automerge store", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest
      .mocked(withLibrarySidecarSyncTransaction)
      .mockImplementation(async (_library, operation) => operation({} as never))
    jest.mocked(createLibrarySidecarDocument).mockResolvedValue({
      state: "genesis",
    } as never)
    jest.mocked(setLibrarySidecarIdentity).mockReturnValue({
      state: "initialized",
      schema: 1,
    } as never)
    jest
      .mocked(librarySidecarDocumentHeads)
      .mockImplementation((document) =>
        (document as unknown as { state: string }).state === "genesis"
          ? ["genesis-head"]
          : ["identity-head"],
      )
    jest.mocked(librarySidecarChangesSince).mockReturnValue([
      {
        actorId: "aaaaaaaaaaaa4aaa8aaaaaaaaaaaaaaa",
        sequence: "1",
        hash: "a".repeat(64),
        bytes: new Uint8Array([1]),
      },
    ])
    jest
      .mocked(saveLibrarySidecarIncremental)
      .mockReturnValue(new Uint8Array([2]))
    jest.mocked(saveLibrarySidecarDocument).mockReturnValue(new Uint8Array([3]))
    jest
      .mocked(hashLibrarySidecarAutomergeBytes)
      .mockResolvedValue("b".repeat(64))
    jest.mocked(readLibrarySidecarAutomergeDiagnostics).mockResolvedValue({
      schemaVersion: 1,
      headsJson: '["identity-head"]',
      changes: 1,
      pendingOutbox: 0,
      receipts: 2,
      projectionVersion: 1,
    })
    jest.mocked(loadLibrarySidecarDocument).mockResolvedValue({
      state: "loaded",
      schema: 1,
    } as never)
  })

  it("should persist state change outbox and projection when initialization commits", async () => {
    jest
      .mocked(readLibrarySidecarAutomergeState)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        schemaVersion: 1,
        snapshotBytes: new Uint8Array([3]),
        headsJson: '["identity-head"]',
        updatedAt: 1,
      })

    await ensureLibrarySidecarAutomergeState(library, identity, 1)

    expect(writeLibrarySidecarAutomergeState).toHaveBeenCalled()
    expect(insertLibrarySidecarAutomergeChange).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        changeHash: "a".repeat(64),
        actorSequence: "1",
        origin: "local",
      }),
    )
    expect(insertLibrarySidecarAutomergeOutbox).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        objectPath: `.myreader/automerge/changes/aaaaaaaaaaaa4aaa8aaaaaaaaaaaaaaa/00000000000000000001-${"a".repeat(64)}.am`,
        bytes: new Uint8Array([2]),
      }),
    )
    expect(writeLibrarySidecarAutomergeProjectionMeta).toHaveBeenCalledWith(
      expect.anything(),
      {
        projectionVersion: 1,
        headsJson: '["identity-head"]',
        rebuiltAt: 1,
      },
    )
  })

  it("should expose local sync metadata when diagnostics are read", async () => {
    await expect(
      readLibrarySidecarAutomergeDiagnosticSnapshot(library),
    ).resolves.toEqual({
      schemaVersion: 1,
      heads: ["identity-head"],
      changes: 1,
      pendingOutbox: 0,
      receipts: 2,
      projectionVersion: 1,
    })
  })

  it("should not publish different bytes when an immutable object already exists", async () => {
    const bytes = new Uint8Array([4])
    jest.mocked(listPendingLibrarySidecarAutomergeOutbox).mockResolvedValue([
      {
        objectPath:
          ".myreader/automerge/changes/actor/00000000000000000001-head.am",
        bytes,
        sha256: "b".repeat(64),
        changeHashesJson: '["head"]',
        publishedAt: null,
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
    expect(markLibrarySidecarAutomergeOutboxPublished).toHaveBeenCalled()
  })

  it("should reuse remote bytes when publication confirmation fails", async () => {
    const bytes = new Uint8Array([4])
    const objectPath =
      ".myreader/automerge/changes/aaaaaaaaaaaa4aaa8aaaaaaaaaaaaaaa/" +
      `00000000000000000001-${"a".repeat(64)}.am`
    jest.mocked(listPendingLibrarySidecarAutomergeOutbox).mockResolvedValue([
      {
        objectPath,
        bytes,
        sha256: "b".repeat(64),
        changeHashesJson: `["${"a".repeat(64)}"]`,
        publishedAt: null,
      },
    ])
    jest
      .mocked(markLibrarySidecarAutomergeOutboxPublished)
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
    expect(markLibrarySidecarAutomergeOutboxPublished).toHaveBeenCalledTimes(2)
  })

  it("should reject a remote object when its bytes exceed the input limit", async () => {
    jest.mocked(readLibrarySidecarAutomergeState).mockResolvedValue({
      schemaVersion: 1,
      snapshotBytes: new Uint8Array([3]),
      headsJson: '["identity-head"]',
      updatedAt: 1,
    })
    jest.mocked(hasLibrarySidecarAutomergeReceipt).mockResolvedValue(false)
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
  })
})
