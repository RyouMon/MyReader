import type { Locator } from "@my-reader/readium"
import { setReadingPosition } from "@/src/services/core/reading"
import type { Library } from "../types"
import { setReadingProgress } from "./reading-progress"

jest.mock("@/src/services/core/reading", () => ({
  getReadingPosition: jest.fn(),
  setReadingPosition: jest.fn(),
}))

jest.mock("@/src/services/query/invalidate-table", () => ({
  invalidateReadingProgress: jest.fn(),
  invalidateReadingStatistics: jest.fn(),
  invalidateRecentlyReadBooks: jest.fn(),
}))

const library = {
  id: "library-1",
  name: "Library",
  path: "file:///library",
  bookCount: 1,
  addedAt: 0,
  sourceType: "local",
} as Library

const locator: Locator = {
  href: "chapter.xhtml",
  type: "application/xhtml+xml",
  locations: { position: 3, progression: 0.4, totalProgression: 0.4 },
}

describe("setReadingProgress", () => {
  it("should persist a canonical locator when a desktop asset href is saved", async () => {
    const assetLocator: Locator = {
      ...locator,
      href: "asset://localhost/%2Ftmp%2Fextracted%2Fruntime-id%2FOPS%2Fchapter.xhtml#part",
    }

    await setReadingProgress(library, 42, "epub", assetLocator, {
      invalidate: false,
    })

    expect(setReadingPosition).toHaveBeenCalledWith(
      library,
      42,
      "EPUB",
      {
        ...locator,
        href: "OPS/chapter.xhtml",
        locations: {
          ...locator.locations,
          fragments: ["part"],
        },
      },
      null,
    )
  })

  it("should reject when the atomic local position write fails", async () => {
    const error = new Error("database unavailable")
    jest.mocked(setReadingPosition).mockRejectedValueOnce(error)
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => {})

    await expect(setReadingProgress(library, 42, "epub", locator)).rejects.toBe(
      error,
    )

    consoleError.mockRestore()
  })
})
