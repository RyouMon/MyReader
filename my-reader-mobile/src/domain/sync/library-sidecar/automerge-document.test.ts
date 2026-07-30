jest.mock("@/modules/myreader-rust-components", () => ({
  __esModule: true,
  default: {
    syncContractVersion: jest.fn(),
    executeSyncDocumentCommand: jest.fn(),
  },
}))

import MyReaderRustComponents from "@/modules/myreader-rust-components"

import {
  createLibrarySidecarDocument,
  librarySidecarFavoriteProjections,
  setLibrarySidecarFavorite,
} from "./automerge-document"
import { LIBRARY_SIDECAR_GENESIS_HEADS } from "./automerge-genesis.generated"

const replicaId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const emptyProjection = {
  readingPositions: [],
  readingPositionCandidates: [],
  favorites: [],
  bookmarks: [],
  annotations: [],
  readingSessions: [],
  readingCompletionRecords: [],
  readingCompletions: [],
}

describe("Rust Automerge document adapter", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.mocked(MyReaderRustComponents.syncContractVersion).mockReturnValue(5)
    jest
      .mocked(MyReaderRustComponents.executeSyncDocumentCommand)
      .mockReturnValue({
        schemaVersion: 1,
        libraryUuid: null,
        snapshotBytes: new Uint8Array([1]),
        heads: [...LIBRARY_SIDECAR_GENESIS_HEADS],
        incrementalBytes: new Uint8Array([2]),
        changes: [],
        missingDependencies: [],
        projectionJson: JSON.stringify(emptyProjection),
      })
  })

  it("should create canonical state when Rust loads the genesis document", async () => {
    const document = await createLibrarySidecarDocument(replicaId)

    expect(document.heads).toEqual(LIBRARY_SIDECAR_GENESIS_HEADS)
    expect(
      MyReaderRustComponents.executeSyncDocumentCommand,
    ).toHaveBeenCalledWith(
      null,
      JSON.stringify({
        replicaId,
        expectedLibraryUuid: null,
        baseHeads: [],
        command: { type: "inspect" },
      }),
      null,
    )
  })

  it("should expose Rust projections when a domain command completes", async () => {
    const document = await createLibrarySidecarDocument(replicaId)
    jest
      .mocked(MyReaderRustComponents.executeSyncDocumentCommand)
      .mockReturnValueOnce({
        schemaVersion: 1,
        libraryUuid: "11111111-2222-4333-8444-555555555555",
        snapshotBytes: new Uint8Array([3]),
        heads: ["favorite-head"],
        incrementalBytes: new Uint8Array([4]),
        changes: [],
        missingDependencies: [],
        projectionJson: JSON.stringify({
          ...emptyProjection,
          favorites: [
            {
              bookId: 7,
              value: {
                isFavorite: true,
                addedAt: 2,
                recordedAt: 2,
                replicaId,
              },
            },
          ],
        }),
      })

    const next = setLibrarySidecarFavorite(document, 7, {
      isFavorite: true,
      addedAt: 2,
      recordedAt: 2,
      replicaId,
    })

    expect(librarySidecarFavoriteProjections(next)).toEqual([
      expect.objectContaining({ bookId: 7 }),
    ])
  })
})
