import { describe, expect, it } from "vitest"

import {
  isRemoteLibrarySourceType,
  libraryTypeOf,
  LOCAL_LIBRARY_DATA_SOURCE_ID,
} from "../src/types/library"

describe("library source type", () => {
  it("should keep the synthetic local data source id stable when libraries are persisted", () => {
    expect(LOCAL_LIBRARY_DATA_SOURCE_ID).toBe("builtin-local-storage")
  })

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

describe("library type", () => {
  it("should treat legacy persisted libraries as Calibre libraries", () => {
    expect(libraryTypeOf({})).toBe("calibre")
  })

  it("should preserve an explicit MyReader library type", () => {
    expect(libraryTypeOf({ libraryType: "myreader" })).toBe("myreader")
  })
})
