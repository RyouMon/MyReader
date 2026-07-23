import {
  type LibrarySidecarAnnotationState,
  type LibrarySidecarReadingSessionState,
  type LibrarySidecarState,
} from "./contract"
import { formatLibrarySidecarHlc } from "./hlc"
import { assertLibrarySidecarWriter, mergeLibrarySidecarState } from "./merge"
import contractFixture from "./fixtures/contract.json"

type MergeFixture = {
  hlc: Array<{
    replicaId: string
  }>
  mergeCases: Array<{
    name: string
    left: LibrarySidecarState
    right: LibrarySidecarState
    expected: LibrarySidecarState
  }>
}

const fixture = contractFixture as MergeFixture

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function expectAlgebraicLaws(states: LibrarySidecarState[]): void {
  for (const left of states) {
    expect(mergeLibrarySidecarState(left, clone(left))).toEqual(left)
    for (const right of states) {
      expect(mergeLibrarySidecarState(left, right)).toEqual(
        mergeLibrarySidecarState(right, left),
      )
      for (const third of states) {
        expect(
          mergeLibrarySidecarState(
            mergeLibrarySidecarState(left, right),
            third,
          ),
        ).toEqual(
          mergeLibrarySidecarState(
            left,
            mergeLibrarySidecarState(right, third),
          ),
        )
      }
    }
  }
}

function generatedLawStates(
  mergeCase: MergeFixture["mergeCases"][number],
): LibrarySidecarState[] {
  return Array.from({ length: 5 }, (_, index) => {
    const state = clone(mergeCase.left)
    const clock = (offset: number) =>
      formatLibrarySidecarHlc({
        physicalMs: 1_771_831_715_000n,
        counter: BigInt(index * 3 + offset),
        replicaId: fixture.hlc[0]!.replicaId,
      })

    switch (state.domain) {
      case "book_favorite.v1":
        state.register = {
          clock: clock(0),
          value: {
            isFavorite: index % 2 === 0,
            addedAtMs: index % 2 === 0 ? 1_771_831_715_000 + index : null,
          },
        }
        break
      case "reading_position.v1":
        state.register = {
          clock: clock(0),
          value: {
            locator: {
              href: `OPS/chapter-${index + 1}.xhtml`,
              type: "application/xhtml+xml",
              locations: { progression: index / 5, position: index + 1 },
            },
            displayProgression: index / 5,
          },
        }
        break
      case "bookmark.v1":
        state.register = {
          clock: clock(0),
          value: {
            ...state.register.value,
            present: index % 2 === 0,
            id: `018f2f8d980b40efb72ec6e86cb7100${index}`,
            deletedAtMs: index % 2 === 0 ? null : 1_771_831_715_000 + index,
          },
        }
        break
      case "annotation.v1":
        state.color = { clock: clock(0), value: `color-${index}` }
        state.note = {
          clock: clock(1),
          value: index % 2 === 0 ? null : `note-${index}`,
        }
        state.tombstone =
          index % 2 === 0
            ? null
            : {
                clock: clock(2),
                deletedAtMs: 1_771_831_715_000 + index,
              }
        break
      case "reading_session.v1":
        state.durationSeconds = index * 137
        break
      case "reading_completion.v1":
        state.id = `018f2f8d980b40efb72ec6e86cb7200${index}`
        state.localDay = `2026-07-${String(23 - index).padStart(2, "0")}`
        state.completedAtMs = 1_771_831_715_000 - index * 1_000
        break
    }
    return state
  })
}

describe("library sidecar merge contract", () => {
  for (const mergeCase of fixture.mergeCases) {
    it(`should match the shared fixture when ${mergeCase.name}`, () => {
      expect(mergeLibrarySidecarState(mergeCase.left, mergeCase.right)).toEqual(
        mergeCase.expected,
      )
      expect(mergeLibrarySidecarState(mergeCase.right, mergeCase.left)).toEqual(
        mergeCase.expected,
      )
    })
  }

  it("should satisfy CRDT algebraic laws when generated domain states are combined", () => {
    for (const mergeCase of fixture.mergeCases) {
      expectAlgebraicLaws(generatedLawStates(mergeCase))
    }
  })

  it("should reject different payloads when the same HLC is reused", () => {
    const mergeCase = fixture.mergeCases[0]!
    const right = clone(mergeCase.left)
    if (right.domain !== "book_favorite.v1") {
      throw new Error("favorite fixture expected")
    }
    right.register.value.isFavorite = !right.register.value.isFavorite
    expect(() => mergeLibrarySidecarState(mergeCase.left, right)).toThrow(
      "equal HLC values must have identical payloads",
    )
  })

  it("should keep an annotation deleted when a newer field update arrives", () => {
    const mergeCase = fixture.mergeCases.find(
      (item) => item.left.domain === "annotation.v1",
    )!
    const deleted = clone(mergeCase.left) as LibrarySidecarAnnotationState
    deleted.tombstone = {
      clock:
        "0000019c89abcdef-0000000000000001-018f2f8d980b40efb72ec6e86cb7cc29",
      deletedAtMs: 1771831715300,
    }
    const edited = clone(mergeCase.right) as LibrarySidecarAnnotationState
    edited.note = {
      clock:
        "0000019c89abcdef-0000000000000002-018f2f8d980b40efb72ec6e86cb7cc30",
      value: "Edited after deletion",
    }

    const result = mergeLibrarySidecarState(
      deleted,
      edited,
    ) as LibrarySidecarAnnotationState
    expect(result.note.value).toBe("Edited after deletion")
    expect(result.tombstone).toEqual(deleted.tombstone)
  })

  it("should reject a session update when the writer is not its origin", () => {
    const session = fixture.mergeCases.find(
      (item) => item.left.domain === "reading_session.v1",
    )!.left as LibrarySidecarReadingSessionState

    expect(() =>
      assertLibrarySidecarWriter(
        session,
        "018f2f8d-980b-40ef-b72e-c6e86cb7cc30",
      ),
    ).toThrow("must come from the origin replica")
  })
})
