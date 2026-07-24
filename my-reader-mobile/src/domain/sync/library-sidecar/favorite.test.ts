jest.mock("@/src/repos/library-sidecar-sync", () => ({
  insertLibrarySidecarOutboxChange: jest.fn(),
  readLibrarySidecarFavorite: jest.fn(),
  readLibrarySidecarHlcState: jest.fn(),
  withLibrarySidecarSyncTransaction: jest.fn(),
  writeLibrarySidecarFavorite: jest.fn(),
  writeLibrarySidecarHlcState: jest.fn(),
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
  readLibrarySidecarFavorite,
  readLibrarySidecarHlcState,
  withLibrarySidecarSyncTransaction,
  writeLibrarySidecarFavorite,
  writeLibrarySidecarHlcState,
} from "@/src/repos/library-sidecar-sync"
import { writeLocalFavorite } from "./favorite"
import { ensureLibrarySidecarIdentity } from "./identity"
import { applyLibrarySidecarSegment } from "./projection"

const library = {
  id: "library-1",
  name: "Library",
  path: "file:///library",
  addedAt: 0,
  bookCount: 1,
  sourceType: "local",
} as Library

const localReplicaId = "018f2f8d-980b-40ef-b72e-c6e86cb7cc29"
const tx = { execute: jest.fn() } as never

function clock(physicalHex: string, counterHex: string, replica: string) {
  return `${physicalHex}-${counterHex}-${replica.replace(/-/g, "")}`
}

describe("book_favorite.v1 projection", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest
      .mocked(withLibrarySidecarSyncTransaction)
      .mockImplementation(async (_library, operation) => operation(tx))
    jest.mocked(ensureLibrarySidecarIdentity).mockResolvedValue({
      libraryUuid: "018f2f8d-980b-40ef-b72e-c6e86cb7cc28",
      replicaId: localReplicaId,
    })
    jest.mocked(readLibrarySidecarFavorite).mockResolvedValue(null)
    jest.mocked(readLibrarySidecarHlcState).mockResolvedValue({
      physicalMs: "1000",
      counter: "2",
    })
  })

  it("should persist projection HLC and outbox in one transaction when a book is favorited", async () => {
    await writeLocalFavorite(library, 42, true, 900)

    const expectedClock = clock(
      "00000000000003e8",
      "0000000000000003",
      localReplicaId,
    )
    expect(writeLibrarySidecarFavorite).toHaveBeenCalledWith(tx, {
      bookId: 42,
      isFavorite: true,
      addedAt: 900,
      syncClock: expectedClock,
    })
    expect(writeLibrarySidecarHlcState).toHaveBeenCalledWith(tx, {
      physicalMs: "1000",
      counter: "3",
    })
    expect(insertLibrarySidecarOutboxChange).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        clock: expectedClock,
        domain: "book_favorite.v1",
        stateJson: JSON.stringify({
          domain: "book_favorite.v1",
          bookId: 42,
          register: {
            clock: expectedClock,
            value: {
              isFavorite: true,
              addedAtMs: 900,
            },
          },
        }),
      }),
    )
  })

  it("should retain a newer tombstone when a book is unfavorited", async () => {
    jest.mocked(readLibrarySidecarFavorite).mockResolvedValue({
      id: "favorite-1",
      bookId: 42,
      addedAt: 700,
      isFavorite: true,
      syncClock: clock("00000000000002bc", "0000000000000000", localReplicaId),
    })

    await writeLocalFavorite(library, 42, false, 1100)

    const expectedClock = clock(
      "000000000000044c",
      "0000000000000000",
      localReplicaId,
    )
    expect(writeLibrarySidecarFavorite).toHaveBeenCalledWith(tx, {
      bookId: 42,
      isFavorite: false,
      addedAt: 700,
      syncClock: expectedClock,
    })
    expect(insertLibrarySidecarOutboxChange).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        stateJson: JSON.stringify({
          domain: "book_favorite.v1",
          bookId: 42,
          register: {
            clock: expectedClock,
            value: {
              isFavorite: false,
              addedAtMs: null,
            },
          },
        }),
      }),
    )
  })

  it("should keep a newer local tombstone when an older remote favorite is replayed", async () => {
    const localClock = clock(
      "00000000000007d0",
      "0000000000000000",
      localReplicaId,
    )
    const remoteClock = clock(
      "00000000000005dc",
      "0000000000000000",
      "018f2f8d-980b-40ef-b72e-c6e86cb7cc30",
    )
    jest.mocked(readLibrarySidecarFavorite).mockResolvedValue({
      id: "favorite-1",
      bookId: 42,
      addedAt: 700,
      isFavorite: false,
      syncClock: localClock,
    })

    await applyLibrarySidecarSegment(
      tx,
      {
        protocol: "library-sidecar-v4",
        libraryUuid: "018f2f8d-980b-40ef-b72e-c6e86cb7cc28",
        replicaId: "018f2f8d-980b-40ef-b72e-c6e86cb7cc30",
        sequence: "1",
        changes: [
          {
            changeId: "018f2f8d980b40efb72ec6e86cb70002",
            clock: remoteClock,
            state: {
              domain: "book_favorite.v1",
              bookId: 42,
              register: {
                clock: remoteClock,
                value: {
                  isFavorite: true,
                  addedAtMs: 1500,
                },
              },
            },
          },
        ],
      },
      localReplicaId,
      1600,
    )

    expect(writeLibrarySidecarFavorite).toHaveBeenCalledWith(tx, {
      bookId: 42,
      isFavorite: false,
      addedAt: 700,
      syncClock: localClock,
    })
  })
})
