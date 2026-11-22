import { describe, expect, it } from "vitest"
import {
  bookExtensions,
  isEpubContainer,
  isTextPublication,
} from "../src/index"

describe("reader format policy", () => {
  it("recognizes the supported mainstream extensions", () => {
    expect(bookExtensions).toContain("mobi")
    expect(bookExtensions).toContain("fb2.zip")
    expect(bookExtensions).toContain("md")
    expect(bookExtensions).toContain("txt")
  })
  it("keeps existing containers on the Readium path", () => {
    expect(isEpubContainer("kepub")).toBe(true)
    expect(isTextPublication("txt")).toBe(true)
    expect(isTextPublication("pdf")).toBe(false)
  })
})
