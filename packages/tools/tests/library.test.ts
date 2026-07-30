import { describe, expect, it } from "vitest"

import { isRemoteLibrarySourceType } from "../src/types/library"

describe("library source type", () => {
  it("should classify network-backed libraries when source type is remote", () => {
    expect(isRemoteLibrarySourceType("webdav")).toBe(true)
    expect(isRemoteLibrarySourceType("onedrive")).toBe(true)
  })

  it("should reject local and missing source types when source is not remote", () => {
    expect(isRemoteLibrarySourceType("local")).toBe(false)
    expect(isRemoteLibrarySourceType(undefined)).toBe(false)
    expect(isRemoteLibrarySourceType(null)).toBe(false)
  })
})
