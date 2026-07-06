import { describe, expect, it } from "vitest"
import { getGridLayoutMetrics } from "../BookGrid"

describe("getGridLayoutMetrics", () => {
  it("should keep two columns when content is narrower than two minimum cards", () => {
    const layout = getGridLayoutMetrics(260)

    expect(layout.cols).toBe(2)
    expect(layout.cardWidth).toBe(122)
    expect(layout.gap).toBe(16)
  })

  it("should cap column gap when two columns have leftover width", () => {
    const layout = getGridLayoutMetrics(430)

    expect(layout.cols).toBe(2)
    expect(layout.cardWidth).toBe(172)
    expect(layout.gap).toBe(28)
  })

  it("should delay adding a column when the next card width is too small", () => {
    expect(getGridLayoutMetrics(448).cols).toBe(2)

    const layout = getGridLayoutMetrics(496)
    expect(layout.cols).toBe(3)
    expect(layout.cardWidth).toBe(152)
  })

  it("should include twelve pixel row gap when calculating grid row height", () => {
    const layout = getGridLayoutMetrics(430)

    expect(layout.cardWidth).toBe(172)
    expect(layout.gridRowHeight).toBe(325)
  })
})
