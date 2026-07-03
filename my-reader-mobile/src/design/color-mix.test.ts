import { mixInk } from "./color-mix"

describe("mixInk", () => {
  it("mixes ink into a hex background", () => {
    expect(mixInk("#7a6b5d", "#f5efe6", 28)).toBe("#d3cac0")
  })

  it("falls back to the ink color for unsupported color formats", () => {
    expect(mixInk("rgba(0,0,0,0.2)", "#f5efe6", 28)).toBe("rgba(0,0,0,0.2)")
  })
})
