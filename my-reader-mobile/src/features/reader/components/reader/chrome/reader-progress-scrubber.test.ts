import {
  clampReaderPositionIndex,
  readerPositionIndexForScrubberTranslation,
  readerProgressOffset,
  readerProgressPercentForPosition,
} from "./reader-progress-scrubber"

describe("reader progress scrubber", () => {
  it("should clamp position indexes when previewing outside the publication", () => {
    expect(clampReaderPositionIndex(-4, 100)).toBe(0)
    expect(clampReaderPositionIndex(140, 100)).toBe(99)
  })

  it("should start from the current position when dragging the pill", () => {
    expect(readerPositionIndexForScrubberTranslation(40, 0, 200, 101)).toBe(40)
    expect(readerPositionIndexForScrubberTranslation(40, 40, 200, 101)).toBe(60)
    expect(readerPositionIndexForScrubberTranslation(40, -40, 200, 101)).toBe(
      20,
    )
  })

  it("should reverse horizontal dragging when reading from right to left", () => {
    expect(
      readerPositionIndexForScrubberTranslation(40, 40, 200, 101, "rtl"),
    ).toBe(20)
    expect(
      readerPositionIndexForScrubberTranslation(40, -40, 200, 101, "rtl"),
    ).toBe(60)
  })

  it("should clamp relative dragging at publication boundaries", () => {
    expect(readerPositionIndexForScrubberTranslation(10, -200, 200, 101)).toBe(
      0,
    )
    expect(readerPositionIndexForScrubberTranslation(90, 200, 200, 101)).toBe(
      100,
    )
  })

  it("should derive preview progress from the target position", () => {
    expect(readerProgressPercentForPosition(50, 101)).toBe(50)
    expect(readerProgressPercentForPosition(100, 101)).toBe(100)
  })

  it("should use the full pill width when positioning progress visuals", () => {
    expect(readerProgressOffset(240, 25)).toBe(60)
    expect(readerProgressOffset(240, 100)).toBe(240)
  })

  it("should position right-to-left progress from the opposite edge", () => {
    expect(readerProgressOffset(240, 25, "rtl")).toBe(180)
    expect(readerProgressOffset(240, 100, "rtl")).toBe(0)
  })
})
