import { readerPositionLabelVisible } from "./ReaderPositionLabel"

describe("ReaderPositionLabel", () => {
  it("hides the reading position while the TTS player is active", () => {
    expect(readerPositionLabelVisible(true, 292, false)).toBe(true)
    expect(readerPositionLabelVisible(true, 292, true)).toBe(false)
  })
})
