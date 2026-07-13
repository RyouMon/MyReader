import { describe, expect, it } from "vitest"
import {
  buildFixedLayoutSpreads,
  logicalToVisualSpreadIndex,
  nearestVisualSpreadIndex,
  spreadIndexForPage,
  visualToLogicalSpreadIndex,
} from "../fixedLayoutPagination"

describe("fixedLayoutPagination", () => {
  it("should keep the cover alone when double-page spreads are enabled", () => {
    expect(buildFixedLayoutSpreads(6, true)).toEqual([[1], [2, 3], [4, 5], [6]])
  })

  it("should create one spread per page when double-page spreads are disabled", () => {
    expect(buildFixedLayoutSpreads(3, false)).toEqual([[1], [2], [3]])
  })

  it("should resolve the spread containing a requested page", () => {
    const spreads = buildFixedLayoutSpreads(6, true)

    expect(spreadIndexForPage(spreads, 3)).toBe(1)
    expect(spreadIndexForPage(spreads, 6)).toBe(3)
  })

  it("should reverse visual indices when reading from right to left", () => {
    expect(logicalToVisualSpreadIndex(0, 4, "rtl")).toBe(3)
    expect(logicalToVisualSpreadIndex(3, 4, "rtl")).toBe(0)
    expect(visualToLogicalSpreadIndex(0, 4, "rtl")).toBe(3)
  })

  it("should choose the nearest snap from the native scroll position", () => {
    expect(nearestVisualSpreadIndex(620, 1000, 5)).toBe(1)
    expect(nearestVisualSpreadIndex(2400, 1000, 3)).toBe(2)
  })
})
