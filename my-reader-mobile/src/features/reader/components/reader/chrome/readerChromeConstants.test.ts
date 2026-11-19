import {
  readerBottomActionInset,
  readerChromeEdgeInset,
  readerExpandedActionBottomInset,
} from "./readerChromeConstants"

describe("reader chrome insets", () => {
  it("uses the larger of the safe area and horizontal edge inset", () => {
    expect(readerChromeEdgeInset(15)).toBe(32)
    expect(readerChromeEdgeInset(48)).toBe(48)
  })

  it("reserves the measured bottom control height", () => {
    expect(readerBottomActionInset(32, 60)).toBe(92)
    expect(readerBottomActionInset(48, 60)).toBe(108)
  })

  it("keeps expanded actions above the system inset", () => {
    expect(readerExpandedActionBottomInset(32)).toBe(96)
    expect(readerExpandedActionBottomInset(48)).toBe(112)
  })
})
