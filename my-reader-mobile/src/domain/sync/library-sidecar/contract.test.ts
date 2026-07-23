import {
  LIBRARY_SIDECAR_MAX_SESSION_DURATION_SECONDS,
  LIBRARY_SIDECAR_PROTOCOL_ERRORS,
  type LibrarySidecarReplicaMetadata,
  type LibrarySidecarSegment,
} from "./contract"
import {
  canonicalizeReaderLocatorForStorage,
  readerBookmarkLocatorKey,
} from "@my-reader/tools/reader-bookmarks"
import type { ReaderLocator } from "@my-reader/tools/reader-toc"
import contractFixture from "./fixtures/contract.json"

type ContractFixture = {
  protocolErrors: string[]
  segment: LibrarySidecarSegment
  replicaMetadata: LibrarySidecarReplicaMetadata
  locator: ReaderLocator
}

const fixture = contractFixture as ContractFixture

describe("library sidecar JSON contract", () => {
  it("should preserve the segment schema when the shared fixture is round tripped", () => {
    expect(
      JSON.parse(JSON.stringify(fixture.segment)) as LibrarySidecarSegment,
    ).toEqual(fixture.segment)
    expect(fixture.segment.protocol).toBe("library-sidecar-v4")
    expect(fixture.segment.sequence).toBe("42")
    expect(fixture.segment.libraryUuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
    expect(fixture.segment.replicaId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
    expect(fixture.segment.changes[0]!.changeId).toMatch(
      /^[0-9a-f]{12}4[0-9a-f]{3}[89ab][0-9a-f]{15}$/,
    )
    expect(LIBRARY_SIDECAR_MAX_SESSION_DURATION_SECONDS).toBe(90_000)
  })

  it("should preserve replica metadata when the shared fixture is round tripped", () => {
    expect(
      JSON.parse(
        JSON.stringify(fixture.replicaMetadata),
      ) as LibrarySidecarReplicaMetadata,
    ).toEqual(fixture.replicaMetadata)
  })

  it("should keep protocol error classifications aligned when loading the shared fixture", () => {
    expect(LIBRARY_SIDECAR_PROTOCOL_ERRORS).toEqual(fixture.protocolErrors)
  })

  it("should preserve canonical locator fields when JSON is round tripped", () => {
    const roundTripped = JSON.parse(
      JSON.stringify(fixture.locator),
    ) as ReaderLocator
    expect(canonicalizeReaderLocatorForStorage(roundTripped)).toEqual(
      fixture.locator,
    )
    expect(readerBookmarkLocatorKey(roundTripped)).toMatch(/^v3:[0-9a-f]{32}$/)
  })
})
