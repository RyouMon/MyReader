import {
  bookLoadRequestKey,
  isReadyBookLoadForRequest,
} from "./book-load-identity"

const readyInLibraryA = {
  status: "ready",
  libraryId: "library-a",
  bookId: 7,
  format: "EPUB",
}

describe("book load identity", () => {
  it("should reject the previous ready publication when the active library changes", () => {
    expect(
      isReadyBookLoadForRequest(readyInLibraryA, "library-a", "7", "epub"),
    ).toBe(true)
    expect(
      isReadyBookLoadForRequest(readyInLibraryA, "library-b", "7", "epub"),
    ).toBe(false)
  })

  it("should reset the publication key when only the active library changes", () => {
    expect(bookLoadRequestKey("library-a", "7", "epub")).not.toBe(
      bookLoadRequestKey("library-b", "7", "epub"),
    )
  })
})
