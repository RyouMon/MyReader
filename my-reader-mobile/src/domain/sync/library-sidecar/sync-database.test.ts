jest.mock("@/modules/myreader-rust-components", () => ({
  __esModule: true,
  default: {
    syncContractVersion: jest.fn(() => 2),
    ensureSyncDatabaseDocument: jest.fn(),
    executeSyncDatabaseCommand: jest.fn(),
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
  executeSyncDatabaseCommand,
} from "./sync-database"

const library = { id: "library-1" } as Library
const identity = {
  libraryUuid: "11111111-2222-4333-8444-555555555555",
  replicaId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
}
const nativeResult = {
  schemaVersion: 1,
  libraryUuid: identity.libraryUuid,
  snapshotBytes: new Uint8Array([1]),
  heads: ["head-1"],
  incrementalBytes: new Uint8Array(),
  changes: [],
  missingDependencies: [],
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
      .mocked(MyReaderRustComponents.ensureSyncDatabaseDocument)
      .mockResolvedValue(nativeResult)
    jest
      .mocked(MyReaderRustComponents.executeSyncDatabaseCommand)
      .mockResolvedValue(nativeResult)
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
})
