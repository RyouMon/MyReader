import { mixInk } from "./color-mix"

describe("mixInk", () => {
  it("should mix ink into a hex background when mixing colors", () => {
    expect(mixInk("#7a6b5d", "#f5efe6", 28)).toBe("#d3cac0")
  })

  it("should fall back to the ink color for unsupported color formats when mixing colors", () => {
    expect(mixInk("rgba(0,0,0,0.2)", "#f5efe6", 28)).toBe("rgba(0,0,0,0.2)")
  })
})
