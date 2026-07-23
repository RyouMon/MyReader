import contractFixture from "./fixtures/contract.json"

import type { LibrarySidecarSegment } from "./contract"
import {
  decodeLibrarySidecarSegmentFile,
  LibrarySidecarSegmentError,
  parseLibrarySidecarSegmentFileName,
  prepareLibrarySidecarSegment,
  validateLibrarySidecarSegment,
} from "./segment"

type SegmentFixture = {
  segment: LibrarySidecarSegment
  segmentEncoding: {
    sha256: string
    fileName: string
  }
}

const fixture = contractFixture as SegmentFixture
const nowMs = 1_771_836_263_919

describe("library sidecar segment", () => {
  it("should produce stable bytes and path when a segment is prepared", () => {
    return prepareLibrarySidecarSegment(fixture.segment, nowMs).then(
      (prepared) => {
        expect(prepared.sha256).toBe(fixture.segmentEncoding.sha256)
        expect(prepared.path).toBe(
          `.myreader/changes-v4/${fixture.segment.replicaId}/${fixture.segmentEncoding.fileName}`,
        )
        expect(prepared.changeIds).toEqual(
          fixture.segment.changes.map((change) => change.changeId),
        )
      },
    )
  })

  it("should restore the segment when valid bytes are decoded", async () => {
    const prepared = await prepareLibrarySidecarSegment(fixture.segment, nowMs)

    expect(
      await decodeLibrarySidecarSegmentFile(
        fixture.segmentEncoding.fileName,
        prepared.bytes,
        {
          libraryUuid: fixture.segment.libraryUuid,
          replicaId: fixture.segment.replicaId,
          nowMs,
        },
      ),
    ).toEqual(fixture.segment)
  })

  it("should reject the segment when its hash does not match the filename", async () => {
    const prepared = await prepareLibrarySidecarSegment(fixture.segment, nowMs)
    const corrupted = prepared.bytes.slice()
    const last = corrupted.length - 1
    corrupted[last] = (corrupted[last] ?? 0) ^ 1

    await expect(
      decodeLibrarySidecarSegmentFile(
        fixture.segmentEncoding.fileName,
        corrupted,
        {
          libraryUuid: fixture.segment.libraryUuid,
          replicaId: fixture.segment.replicaId,
          nowMs,
        },
      ),
    ).rejects.toThrow(
      expect.objectContaining<Partial<LibrarySidecarSegmentError>>({
        code: "file_hash_mismatch",
      }),
    )
  })

  it("should reject the segment when its library UUID differs", () => {
    expect(() =>
      validateLibrarySidecarSegment(fixture.segment, {
        libraryUuid: "018f2f8d-980b-40ef-b72e-c6e86cb7cc20",
        nowMs,
      }),
    ).toThrow(
      expect.objectContaining<Partial<LibrarySidecarSegmentError>>({
        code: "library_mismatch",
      }),
    )
  })

  it("should reject the segment when its change clock is in the future", () => {
    expect(() =>
      validateLibrarySidecarSegment(fixture.segment, {
        nowMs: 1_700_000_000_000,
      }),
    ).toThrow(
      expect.objectContaining<Partial<LibrarySidecarSegmentError>>({
        code: "future_clock",
      }),
    )
  })

  it("should order sequence filenames by numeric value when names arrive out of order", () => {
    const names = [
      "10-00000000000000000000000000000000.json",
      "2-00000000000000000000000000000000.json",
      "1-00000000000000000000000000000000.json",
    ]

    expect(
      names
        .map((name) => parseLibrarySidecarSegmentFileName(name))
        .sort((left, right) =>
          BigInt(left.sequence) < BigInt(right.sequence) ? -1 : 1,
        )
        .map((item) => item.sequence),
    ).toEqual(["1", "2", "10"])
  })

  it("should reject a sequence filename when it exceeds u64", () => {
    expect(() =>
      parseLibrarySidecarSegmentFileName(
        "18446744073709551616-00000000000000000000000000000000.json",
      ),
    ).toThrow(
      expect.objectContaining<Partial<LibrarySidecarSegmentError>>({
        code: "invalid_change",
      }),
    )
  })
})
