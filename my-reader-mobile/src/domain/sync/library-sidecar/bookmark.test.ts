jest.mock("@/src/repos/library-sidecar-sync", () => ({
  insertLibrarySidecarOutboxChange: jest.fn(),
  readLibrarySidecarBookmark: jest.fn(),
  readLibrarySidecarHlcState: jest.fn(),
  withLibrarySidecarSyncTransaction: jest.fn(),
  writeLibrarySidecarBookmark: jest.fn(),
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
  readLibrarySidecarBookmark,
  readLibrarySidecarHlcState,
  withLibrarySidecarSyncTransaction,
  writeLibrarySidecarBookmark,
  writeLibrarySidecarHlcState,
} from "@/src/repos/library-sidecar-sync"
import { addLocalBookmark, removeLocalBookmark } from "./bookmark"
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

describe("bookmark.v1 projection", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest
      .mocked(withLibrarySidecarSyncTransaction)
      .mockImplementation(async (_library, operation) => operation(tx))
    jest.mocked(ensureLibrarySidecarIdentity).mockResolvedValue({
      libraryUuid: "018f2f8d-980b-40ef-b72e-c6e86cb7cc28",
      replicaId: localReplicaId,
    })
    jest.mocked(readLibrarySidecarBookmark).mockResolvedValue(null)
    jest.mocked(readLibrarySidecarHlcState).mockResolvedValue({
      physicalMs: "1000",
      counter: "2",
    })
    jest
      .mocked(writeLibrarySidecarBookmark)
      .mockImplementation(async (_tx, row) => ({ ...row }))
  })

  it("should persist projection HLC and outbox in one transaction when a bookmark is added", async () => {
    const locator = {
      href: "chapter.xhtml",
      type: "application/xhtml+xml",
      locations: { progression: 0.4 },
    }

    await addLocalBookmark(
      library,
      42,
      "epub",
      "chapter.xhtml@0.4",
      locator,
      900,
    )

    const expectedClock = clock(
      "00000000000003e8",
      "0000000000000003",
      localReplicaId,
    )
    expect(writeLibrarySidecarBookmark).toHaveBeenCalledWith(tx, {
      id: "018f2f8d980b40efb72ec6e86cb70001",
      bookId: 42,
      format: "EPUB",
      locatorKey: "chapter.xhtml@0.4",
      locatorJson: JSON.stringify(locator),
      createdAt: 900,
      updatedAt: 1000,
      deletedAt: null,
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
        domain: "bookmark.v1",
        stateJson: JSON.stringify({
          domain: "bookmark.v1",
          bookId: 42,
          format: "EPUB",
          locatorKey: "chapter.xhtml@0.4",
          register: {
            clock: expectedClock,
            value: {
              present: true,
              id: "018f2f8d980b40efb72ec6e86cb70001",
              locator,
              createdAtMs: 900,
              deletedAtMs: null,
            },
          },
        }),
      }),
    )
  })

  it("should persist a tombstone when an active bookmark is removed", async () => {
    const existingClock = clock(
      "00000000000002bc",
      "0000000000000000",
      localReplicaId,
    )
    const locator = {
      href: "chapter.xhtml",
      type: "application/xhtml+xml",
      locations: { progression: 0.4 },
    }
    jest.mocked(readLibrarySidecarBookmark).mockResolvedValue({
      id: "bookmark-1",
      bookId: 42,
      format: "EPUB",
      locatorKey: "chapter.xhtml@0.4",
      locatorJson: JSON.stringify(locator),
      createdAt: 700,
      updatedAt: 700,
      deletedAt: null,
      syncClock: existingClock,
    })

    await removeLocalBookmark(library, 42, "epub", "chapter.xhtml@0.4", 1100)

    const expectedClock = clock(
      "000000000000044c",
      "0000000000000000",
      localReplicaId,
    )
    expect(writeLibrarySidecarBookmark).toHaveBeenCalledWith(tx, {
      id: "bookmark-1",
      bookId: 42,
      format: "EPUB",
      locatorKey: "chapter.xhtml@0.4",
      locatorJson: JSON.stringify(locator),
      createdAt: 700,
      updatedAt: 1100,
      deletedAt: 1100,
      syncClock: expectedClock,
    })
    expect(insertLibrarySidecarOutboxChange).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        domain: "bookmark.v1",
        stateJson: expect.stringContaining('"present":false'),
      }),
    )
  })

  it("should keep a newer local tombstone when an older remote bookmark is replayed", async () => {
    const localClock = clock(
      "00000000000007d0",
      "0000000000000000",
      localReplicaId,
    )
    const remoteReplicaId = "018f2f8d-980b-40ef-b72e-c6e86cb7cc30"
    const remoteClock = clock(
      "00000000000005dc",
      "0000000000000000",
      remoteReplicaId,
    )
    const locator = {
      href: "chapter.xhtml",
      type: "application/xhtml+xml",
      locations: { progression: 0.4 },
    }
    jest.mocked(readLibrarySidecarBookmark).mockResolvedValue({
      id: "bookmark-1",
      bookId: 42,
      format: "EPUB",
      locatorKey: "chapter.xhtml@0.4",
      locatorJson: JSON.stringify(locator),
      createdAt: 700,
      updatedAt: 2000,
      deletedAt: 2000,
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
              domain: "bookmark.v1",
              bookId: 42,
              format: "EPUB",
              locatorKey: "chapter.xhtml@0.4",
              register: {
                clock: remoteClock,
                value: {
                  present: true,
                  id: "bookmark-1",
                  locator,
                  createdAtMs: 700,
                  deletedAtMs: null,
                },
              },
            },
          },
        ],
      },
      localReplicaId,
      1600,
    )

    expect(writeLibrarySidecarBookmark).toHaveBeenCalledWith(tx, {
      id: "bookmark-1",
      bookId: 42,
      format: "EPUB",
      locatorKey: "chapter.xhtml@0.4",
      locatorJson: JSON.stringify(locator),
      createdAt: 700,
      updatedAt: 2000,
      deletedAt: 2000,
      syncClock: localClock,
    })
  })
})
