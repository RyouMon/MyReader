jest.mock("@/modules/myreader-rust-components", () => ({
  __esModule: true,
  default: {
    syncContractVersion: jest.fn(() => 7),
  },
}))

import {
  librarySidecarDocumentFromNativeResult,
  librarySidecarFavoriteProjections,
} from "./document-contract"

const replicaId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"

function nativeResult(projection: object) {
  return {
    schemaVersion: 1,
    heads: ["head-1"],
    projectionJson: JSON.stringify(projection),
  }
}

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

describe("Rust sync projection contract", () => {
  it("should expose native projection when database command completes", () => {
    const document = librarySidecarDocumentFromNativeResult(
      nativeResult({
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
    )

    expect(librarySidecarFavoriteProjections(document)).toEqual([
      expect.objectContaining({ bookId: 7 }),
    ])
  })

  it("should reject projection when one required domain collection is missing", () => {
    const { bookmarks: _bookmarks, ...incomplete } = emptyProjection

    expect(() =>
      librarySidecarDocumentFromNativeResult(nativeResult(incomplete)),
    ).toThrow("MyReader Rust sync projection is invalid")
  })
})
