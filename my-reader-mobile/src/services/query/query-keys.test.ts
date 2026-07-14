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
    expect(queryKeys.readerBookmarksRoot("lib-1")).toEqual([
      "reader-bookmarks",
      "lib-1",
    ])
    expect(queryKeys.readerBookmarks("lib-1", 7, "epub")).toEqual([
      "reader-bookmarks",
      "lib-1",
      7,
      "EPUB",
    ])
    expect(queryKeys.recentlyReadBooks("lib-1")).toEqual([
      "recently-read-books",
      "lib-1",
    ])
    expect(queryKeys.bookCoverThumbnailCache("lib-1", 300, 429, "v1")).toEqual([
      "book-cover-thumbnail-cache",
      "lib-1",
      300,
      429,
      "v1",
    ])
    expect(
      queryKeys.bookCoverThumbnailCacheProfiles(
        "lib-1",
        "300x429|432x618",
        "v1",
      ),
    ).toEqual([
      "book-cover-thumbnail-cache-profiles",
      "lib-1",
      "300x429|432x618",
      "v1",
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
    expect(queryKeys.readerBookmarks()).toEqual([
      "reader-bookmarks",
      undefined,
      undefined,
      undefined,
    ])
    expect(queryKeys.bookCoverThumbnailCache()).toEqual([
      "book-cover-thumbnail-cache",
      undefined,
      undefined,
      undefined,
      undefined,
    ])
    expect(queryKeys.bookCoverThumbnailCacheProfiles()).toEqual([
      "book-cover-thumbnail-cache-profiles",
      undefined,
      undefined,
      undefined,
    ])
  })
})
