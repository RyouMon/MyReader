import { describe, expect, it } from "vitest"
import { PdfNavigator } from "../PdfNavigator"

describe("PdfNavigator", () => {
  it("should reverse a spread visually when reading from right to left", () => {
    const navigator = new PdfNavigator("book.pdf")
    Reflect.set(navigator, "_currentPage", 2)
    Reflect.set(navigator, "_totalPages", 5)
    navigator.spreadMode = "double"

    expect(navigator.getSpreadPagesInReadingOrder(1200, 800, "ltr")).toEqual([
      2, 3,
    ])
    expect(navigator.getSpreadPagesInReadingOrder(1200, 800, "rtl")).toEqual([
      3, 2,
    ])
  })
})
