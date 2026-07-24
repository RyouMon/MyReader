jest.mock("@/src/repos/library-sidecar-sync", () => ({
  insertLibrarySidecarOutboxChange: jest.fn(),
  readLibrarySidecarHlcState: jest.fn(),
  readLibrarySidecarLocalMeta: jest.fn(),
  readLibrarySidecarReadingPosition: jest.fn(),
  withLibrarySidecarSyncTransaction: jest.fn(),
  writeLibrarySidecarHlcState: jest.fn(),
  writeLibrarySidecarReadingPosition: jest.fn(),
}))

jest.mock("./identity", () => ({
  ensureLibrarySidecarIdentity: jest.fn(),
}))

jest.mock("@/src/utils/common", () => ({
  uuid: jest.fn(() => "018f2f8d980b40efb72ec6e86cb70001"),
}))

import type { Library } from "@my-reader/tools/types/library"
import {
  insertLibrarySidecarOutboxChange,
  readLibrarySidecarHlcState,
  readLibrarySidecarReadingPosition,
  withLibrarySidecarSyncTransaction,
  writeLibrarySidecarHlcState,
  writeLibrarySidecarReadingPosition,
} from "@/src/repos/library-sidecar-sync"
import { ensureLibrarySidecarIdentity } from "./identity"
import { applyLibrarySidecarSegment } from "./projection"
import { writeLocalReadingPosition } from "./reading-position"

const library = {
  id: "library-1",
  name: "Library",
  path: "file:///library",
  addedAt: 0,
  bookCount: 1,
  sourceType: "local",
} as Library

const localReplicaId = "018f2f8d-980b-40ef-b72e-c6e86cb7cc29"
const remoteReplicaId = "018f2f8d-980b-40ef-b72e-c6e86cb7cc30"
const tx = { execute: jest.fn() } as never

function clock(physicalHex: string, counterHex: string, replica: string) {
  return `${physicalHex}-${counterHex}-${replica.replace(/-/g, "")}`
}

describe("reading_position.v1 projection", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest
      .mocked(withLibrarySidecarSyncTransaction)
      .mockImplementation(async (_library, operation) => operation(tx))
    jest.mocked(ensureLibrarySidecarIdentity).mockResolvedValue({
      libraryUuid: "018f2f8d-980b-40ef-b72e-c6e86cb7cc28",
      replicaId: localReplicaId,
    })
    jest.mocked(readLibrarySidecarHlcState).mockResolvedValue({
      physicalMs: "1000",
      counter: "2",
    })
  })

  it("should persist projection HLC and outbox in one transaction when position moves backward", async () => {
    await writeLocalReadingPosition(
      library,
      {
        bookId: 42,
        format: "epub",
        locator: {
          href: "chapter-1.xhtml",
          type: "application/xhtml+xml",
          locations: { progression: 0.1 },
        },
        displayProgression: 0.1,
      },
      900,
    )

    expect(writeLibrarySidecarReadingPosition).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        bookId: 42,
        format: "EPUB",
        displayProgression: 0.1,
        updatedAt: 1000,
        syncClock: clock(
          "00000000000003e8",
          "0000000000000003",
          localReplicaId,
        ),
      }),
    )
    expect(writeLibrarySidecarHlcState).toHaveBeenCalledWith(tx, {
      physicalMs: "1000",
      counter: "3",
    })
    expect(insertLibrarySidecarOutboxChange).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        domain: "reading_position.v1",
        clock: clock("00000000000003e8", "0000000000000003", localReplicaId),
      }),
    )
  })

  it("should keep newer local projection when an older remote position is replayed", async () => {
    const localClock = clock(
      "00000000000007d0",
      "0000000000000000",
      localReplicaId,
    )
    const remoteClock = clock(
      "00000000000005dc",
      "0000000000000000",
      remoteReplicaId,
    )
    jest.mocked(readLibrarySidecarReadingPosition).mockResolvedValue({
      id: "row-1",
      bookId: 42,
      format: "EPUB",
      locatorJson: JSON.stringify({
        href: "chapter-8.xhtml",
        type: "application/xhtml+xml",
      }),
      displayProgression: 0.8,
      updatedAt: 2000,
      syncClock: localClock,
    })

    await applyLibrarySidecarSegment(
      tx,
      {
        protocol: "library-sidecar-v4",
        libraryUuid: "018f2f8d-980b-40ef-b72e-c6e86cb7cc28",
        replicaId: remoteReplicaId,
        sequence: "1",
        changes: [
          {
            changeId: "018f2f8d980b40efb72ec6e86cb70002",
            clock: remoteClock,
            state: {
              domain: "reading_position.v1",
              bookId: 42,
              format: "EPUB",
              register: {
                clock: remoteClock,
                value: {
                  locator: {
                    href: "chapter-3.xhtml",
                    type: "application/xhtml+xml",
                  },
                  displayProgression: 0.3,
                },
              },
            },
          },
        ],
      },
      localReplicaId,
      1600,
    )

    expect(writeLibrarySidecarReadingPosition).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        locatorJson: JSON.stringify({
          href: "chapter-8.xhtml",
          type: "application/xhtml+xml",
        }),
        displayProgression: 0.8,
        syncClock: localClock,
      }),
    )
  })
})
