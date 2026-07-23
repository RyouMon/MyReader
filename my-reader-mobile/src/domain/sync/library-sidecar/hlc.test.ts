import { LIBRARY_SIDECAR_MAX_FUTURE_SKEW_MS } from "./contract"
import {
  compareLibrarySidecarHlc,
  formatLibrarySidecarHlc,
  isLibrarySidecarHlcInFuture,
  nextLibrarySidecarHlc,
  observeLibrarySidecarHlc,
  parseLibrarySidecarHlc,
} from "./hlc"
import contractFixture from "./fixtures/contract.json"

type HlcFixture = {
  hlc: Array<{
    encoded: string
    physicalMs: string
    counter: string
    replicaId: string
  }>
}

const fixture = contractFixture as HlcFixture

describe("library sidecar HLC", () => {
  it("should round trip the fixed HLC encoding when parsing shared fixtures", () => {
    for (const item of fixture.hlc) {
      const parsed = parseLibrarySidecarHlc(item.encoded)
      expect(parsed).toEqual({
        physicalMs: BigInt(item.physicalMs),
        counter: BigInt(item.counter),
        replicaId: item.replicaId,
      })
      expect(formatLibrarySidecarHlc(parsed)).toBe(item.encoded)
    }
  })

  it("should increment the counter when the wall clock does not advance", () => {
    expect(
      nextLibrarySidecarHlc(
        { physicalMs: 100n, counter: 4n },
        99n,
        fixture.hlc[0]!.replicaId,
      ),
    ).toEqual({
      physicalMs: 100n,
      counter: 5n,
      replicaId: fixture.hlc[0]!.replicaId,
    })
  })

  it("should advance beyond local and remote clocks when observing a tie", () => {
    expect(
      observeLibrarySidecarHlc(
        { physicalMs: 100n, counter: 4n },
        {
          physicalMs: 100n,
          counter: 7n,
          replicaId: fixture.hlc[0]!.replicaId,
        },
        90n,
        "018f2f8d-980b-40ef-b72e-c6e86cb7cc30",
      ),
    ).toEqual({
      physicalMs: 100n,
      counter: 8n,
      replicaId: "018f2f8d-980b-40ef-b72e-c6e86cb7cc30",
    })
  })

  it("should quarantine a clock when it exceeds the future skew limit", () => {
    const nowMs = 1_000_000
    const remote = formatLibrarySidecarHlc({
      physicalMs: BigInt(nowMs + LIBRARY_SIDECAR_MAX_FUTURE_SKEW_MS + 1),
      counter: 0n,
      replicaId: fixture.hlc[0]!.replicaId,
    })
    expect(isLibrarySidecarHlcInFuture(remote, nowMs)).toBe(true)
  })

  it("should reject malformed clocks when comparing HLC values", () => {
    expect(() =>
      compareLibrarySidecarHlc("invalid", fixture.hlc[0]!.encoded),
    ).toThrow("invalid sidecar HLC")
  })

  it("should reject a clock when its replica UUID has a non-IETF variant", () => {
    expect(() =>
      parseLibrarySidecarHlc(
        "0000019c89abcdef-000000000000002a-018f2f8d980b00ef772ec6e86cb7cc29",
      ),
    ).toThrow("HLC replicaId must be a UUIDv4")
  })

  it("should reject a clock when its replica UUID is not version 4", () => {
    expect(() =>
      parseLibrarySidecarHlc(
        "0000019c89abcdef-000000000000002a-018f2f8d980b70efb72ec6e86cb7cc29",
      ),
    ).toThrow("HLC replicaId must be a UUIDv4")
  })

  it("should reject a replica UUID when formatting a clock with a non-v4 UUID", () => {
    expect(() =>
      formatLibrarySidecarHlc({
        physicalMs: 1n,
        counter: 0n,
        replicaId: "018f2f8d-980b-70ef-b72e-c6e86cb7cc29",
      }),
    ).toThrow("replicaId must be a lowercase UUIDv4")
  })
})
