import { describe, expect, it } from "vitest"

import { extractYear, formatFileSize } from "../src/book-metadata"

describe("book metadata", () => {
  it("should choose a readable unit when file size is formatted", () => {
    expect(formatFileSize(512)).toBe("512 B")
    expect(formatFileSize(1536)).toBe("1.5 KB")
    expect(formatFileSize(1.5 * 1024 * 1024)).toBe("1.5 MB")
  })

  it("should return a valid year when publication date is inspected", () => {
    expect(extractYear("2025-07-31T00:00:00Z")).toBe("2025")
    expect(extractYear("0001-01-01T00:00:00Z")).toBeNull()
    expect(extractYear(null)).toBeNull()
  })
})
