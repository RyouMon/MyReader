import contractFixture from "./fixtures/contract.json"

import type { Library } from "@my-reader/tools/types/library"
import {
  insertLibrarySidecarLocalMeta,
  insertLibrarySidecarSyncError,
  listUnassignedLibrarySidecarOutbox,
  markLibrarySidecarPreparedSegmentPublished,
  readLibrarySidecarCursor,
  readLibrarySidecarLocalMeta,
  readPendingLibrarySidecarPreparedSegment,
  withLibrarySidecarSyncTransaction,
  writeLibrarySidecarCursor,
  type LibrarySidecarPreparedSegmentRow,
} from "@/src/repos/library-sidecar-sync"
import type { ResolvedSyncTarget } from "../resolve"
import type { LibrarySidecarSegment } from "./contract"
import {
  ensureLibrarySidecarReplicaIdentity,
  planLibrarySidecarReplicaFiles,
  publishLibrarySidecarSegments,
  pullLibrarySidecarSegments,
} from "./kernel"
import {
  LibrarySidecarSegmentError,
  prepareLibrarySidecarSegment,
} from "./segment"

jest.mock("@/src/repos/library-sidecar-sync", () => ({
  insertLibrarySidecarLocalMeta: jest.fn(),
  insertLibrarySidecarPreparedSegment: jest.fn(),
  insertLibrarySidecarSyncError: jest.fn(),
  listUnassignedLibrarySidecarOutbox: jest.fn(),
  markLibrarySidecarPreparedSegmentPublished: jest.fn(),
  readLibrarySidecarCursor: jest.fn(),
  readLibrarySidecarLocalMeta: jest.fn(),
  readPendingLibrarySidecarPreparedSegment: jest.fn(),
  withLibrarySidecarSyncTransaction: jest.fn(),
  writeLibrarySidecarCursor: jest.fn(),
}))

type KernelFixture = {
  segment: LibrarySidecarSegment
  segmentEncoding: {
    fileName: string
  }
}

const fixture = contractFixture as KernelFixture
const nowMs = 1_771_836_263_919
const library: Library = {
  id: "library-1",
  name: "Test Library",
  path: "/library",
  bookCount: 1,
  sourceType: "webdav",
}
const identity = {
  libraryUuid: fixture.segment.libraryUuid,
  replicaId: "018f2f8d-980b-40ef-b72e-c6e86cb7cc30",
}

function backend(
  overrides: Partial<ResolvedSyncTarget["backend"]>,
): ResolvedSyncTarget["backend"] {
  return {
    kind: "webdav",
    readBytes: jest.fn(),
    writeBytes: jest.fn(),
    deleteRemote: jest.fn(),
    statRemote: jest.fn(),
    listRemote: jest.fn(),
    ...overrides,
  } as unknown as ResolvedSyncTarget["backend"]
}

describe("library sidecar sync kernel", () => {
  beforeEach(() => {
    jest.resetAllMocks()
    jest
      .mocked(withLibrarySidecarSyncTransaction)
      .mockImplementation(async (_library, operation) => operation({} as never))
  })

  it("should reuse the replica when identity is initialized again", async () => {
    jest.mocked(readLibrarySidecarLocalMeta).mockResolvedValue({
      protocol: "library-sidecar-v4",
      libraryUuid: fixture.segment.libraryUuid,
      replicaId: identity.replicaId,
      nextSequence: "1",
    })

    await expect(
      ensureLibrarySidecarReplicaIdentity(library, fixture.segment.libraryUuid),
    ).resolves.toEqual(identity)

    expect(insertLibrarySidecarLocalMeta).not.toHaveBeenCalled()
  })

  it("should create a UUIDv4 replica when identity is initialized first", async () => {
    jest
      .mocked(readLibrarySidecarLocalMeta)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        protocol: "library-sidecar-v4",
        libraryUuid: fixture.segment.libraryUuid,
        replicaId: "a1b2c3d4-e5f6-4890-abcd-ef1234567890",
        nextSequence: "1",
      })

    await expect(
      ensureLibrarySidecarReplicaIdentity(library, fixture.segment.libraryUuid),
    ).resolves.toEqual({
      libraryUuid: fixture.segment.libraryUuid,
      replicaId: "a1b2c3d4-e5f6-4890-abcd-ef1234567890",
    })

    expect(insertLibrarySidecarLocalMeta).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        replicaId: "a1b2c3d4-e5f6-4890-abcd-ef1234567890",
      }),
    )
  })

  it("should resend identical JSON bytes when upload is retried after a crash", async () => {
    const prepared = await prepareLibrarySidecarSegment(fixture.segment, nowMs)
    let pending: LibrarySidecarPreparedSegmentRow | null = {
      sequence: prepared.sequence,
      path: prepared.path,
      bytes: prepared.bytes,
      sha256: prepared.sha256,
      changeIdsJson: JSON.stringify(prepared.changeIds),
      publishedAt: null,
    }
    jest
      .mocked(readPendingLibrarySidecarPreparedSegment)
      .mockImplementation(async () => pending)
    jest
      .mocked(markLibrarySidecarPreparedSegmentPublished)
      .mockImplementation(async () => {
        pending = null
      })
    jest.mocked(readLibrarySidecarLocalMeta).mockResolvedValue({
      protocol: "library-sidecar-v4",
      libraryUuid: fixture.segment.libraryUuid,
      replicaId: fixture.segment.replicaId,
      nextSequence: "43",
    })
    jest.mocked(listUnassignedLibrarySidecarOutbox).mockResolvedValue([])

    const writes: Uint8Array[] = []
    const writeBytes = jest
      .fn()
      .mockImplementationOnce(async (_path, bytes: Uint8Array) => {
        writes.push(bytes.slice())
        throw new Error("connection lost after upload")
      })
      .mockImplementationOnce(async (_path, bytes: Uint8Array) => {
        writes.push(bytes.slice())
      })
    const target = backend({ writeBytes })

    await expect(
      publishLibrarySidecarSegments(library, target, nowMs),
    ).rejects.toThrow("connection lost after upload")
    await expect(
      publishLibrarySidecarSegments(library, target, nowMs),
    ).resolves.toBe(1)

    expect(writes).toHaveLength(2)
    expect(writes[1]).toEqual(writes[0])
    expect(markLibrarySidecarPreparedSegmentPublished).toHaveBeenCalledTimes(1)
  })

  it("should stop a replica stream when a sequence is missing", () => {
    expect(() =>
      planLibrarySidecarReplicaFiles(
        [
          "1-00000000000000000000000000000000.json",
          "3-00000000000000000000000000000000.json",
        ],
        "0",
      ),
    ).toThrow(
      expect.objectContaining<Partial<LibrarySidecarSegmentError>>({
        code: "missing_sequence",
      }),
    )
  })

  it("should report a replica fork when one sequence has two segment files", () => {
    expect(() =>
      planLibrarySidecarReplicaFiles(
        [
          "1-00000000000000000000000000000000.json",
          "1-11111111111111111111111111111111.json",
        ],
        "0",
      ),
    ).toThrow(
      expect.objectContaining<Partial<LibrarySidecarSegmentError>>({
        code: "replica_fork",
      }),
    )
  })

  it("should keep the cursor unchanged when projection fails", async () => {
    const prepared = await prepareLibrarySidecarSegment(fixture.segment, nowMs)
    jest.mocked(readLibrarySidecarCursor).mockResolvedValue({
      replicaId: fixture.segment.replicaId,
      sequence: "41",
      fileHash: "0".repeat(64),
    })
    const listRemote = jest
      .fn()
      .mockResolvedValueOnce([`${fixture.segment.replicaId}/`])
      .mockResolvedValueOnce([fixture.segmentEncoding.fileName])
    const target = backend({
      listRemote,
      readBytes: jest.fn().mockResolvedValue(prepared.bytes),
    })

    await expect(
      pullLibrarySidecarSegments(
        library,
        target,
        identity,
        async () => {
          throw new Error("projection failed")
        },
        nowMs,
      ),
    ).resolves.toBe(0)

    expect(writeLibrarySidecarCursor).not.toHaveBeenCalled()
    expect(insertLibrarySidecarSyncError).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        code: "projection_failed",
        replicaId: fixture.segment.replicaId,
        sequence: fixture.segment.sequence,
        fileHash: prepared.sha256,
      }),
    )
  })

  it("should propagate the error when transport listing fails", async () => {
    jest.mocked(readLibrarySidecarCursor).mockResolvedValue(null)
    const listRemote = jest
      .fn()
      .mockResolvedValueOnce([`${fixture.segment.replicaId}/`])
      .mockRejectedValueOnce(new Error("network unavailable"))
    const target = backend({ listRemote })

    await expect(
      pullLibrarySidecarSegments(
        library,
        target,
        identity,
        async () => {},
        nowMs,
      ),
    ).rejects.toThrow("network unavailable")

    expect(insertLibrarySidecarSyncError).not.toHaveBeenCalled()
  })
})
