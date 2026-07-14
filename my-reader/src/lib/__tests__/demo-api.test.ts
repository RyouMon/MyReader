import { afterEach, describe, expect, it } from "vitest"
import { demoCommands } from "../demo-api"

const DEFAULT_LIBRARY_ID = "demo-library"

afterEach(async () => {
  await demoCommands.switchLibrary(DEFAULT_LIBRARY_ID)
})

describe("demo bookmark commands", () => {
  it("should resolve null library id through the active library for every operation", async () => {
    const activeLibraryId = "demo-bookmark-library"
    const bookId = 99_991
    const locatorKey = "demo-bookmark-key"
    await demoCommands.switchLibrary(activeLibraryId)

    const added = await demoCommands.addReaderBookmark(
      null,
      bookId,
      "epub",
      locatorKey,
      {
        href: "chapter.xhtml",
        type: "application/xhtml+xml",
        locations: { progression: 0.5 },
      },
    )
    expect(added.data.libraryId).toBe(activeLibraryId)

    const listed = await demoCommands.listReaderBookmarks(null, bookId, "EPUB")
    expect(listed.data).toHaveLength(1)
    expect(listed.data[0]?.id).toBe(added.data.id)

    await demoCommands.deleteReaderBookmark(null, bookId, "EPUB", locatorKey)
    const afterDelete = await demoCommands.listReaderBookmarks(
      null,
      bookId,
      "EPUB",
    )
    expect(afterDelete.data).toEqual([])
  })
})
