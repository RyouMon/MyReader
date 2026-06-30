import { queryKeys } from "./query-keys"

describe("queryKeys", () => {
  it("should include library id when building scoped keys", () => {
    expect(queryKeys.favoriteBooks("lib-1")).toEqual([
      "favorite-books",
      "lib-1",
    ])
    expect(queryKeys.bookReadingFormat("lib-1")).toEqual([
      "book-reading-format",
      "lib-1",
    ])
    expect(queryKeys.fileStates("lib-1")).toEqual(["file-states", "lib-1"])
    expect(queryKeys.readingProgress("lib-1")).toEqual([
      "reading-progress",
      "lib-1",
    ])
    expect(queryKeys.recentlyReadBooks("lib-1")).toEqual([
      "recently-read-books",
      "lib-1",
    ])
  })

  it("should include book count when building book format key", () => {
    expect(queryKeys.bookFormats("lib-1", 12)).toEqual([
      "book-formats",
      "lib-1",
      12,
    ])
  })

  it("should preserve undefined scope when optional arguments are omitted", () => {
    expect(queryKeys.favoriteBooks()).toEqual(["favorite-books", undefined])
    expect(queryKeys.bookFormats()).toEqual([
      "book-formats",
      undefined,
      undefined,
    ])
  })
})
