import { describe, expect, it } from "vitest"

import { appendRemotePathSegment } from "../src/remote-path"

describe("appendRemotePathSegment", () => {
  it("should append one directory name to root and nested paths", () => {
    expect(appendRemotePathSegment("/", "My Library")).toBe("/My Library")
    expect(appendRemotePathSegment("/Books/", "My Library")).toBe(
      "/Books/My Library",
    )
  })

  it("should reject empty, traversal, and multi-segment names", () => {
    for (const value of ["", " ", ".", "..", "A/B", "A\\B", "A\0B"]) {
      expect(appendRemotePathSegment("/Books", value)).toBeNull()
    }
  })
})
