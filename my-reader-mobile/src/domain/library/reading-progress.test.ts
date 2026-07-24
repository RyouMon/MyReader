import type { Locator } from "@my-reader/readium"
import type { Library } from "../types"
import { writeLocalReadingPosition } from "../sync/library-sidecar/reading-position"
import { setReadingProgress } from "./reading-progress"

jest.mock("../../repos/reading-progress", () => ({
  getReadingProgressRow: jest.fn(),
}))

jest.mock("../sync/library-sidecar/reading-position", () => ({
  writeLocalReadingPosition: jest.fn(),
}))

jest.mock("@/src/services/query/invalidate-table", () => ({
  invalidateReadingProgress: jest.fn(),
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
  it("should reject when the atomic local position write fails", async () => {
    const error = new Error("database unavailable")
    jest.mocked(writeLocalReadingPosition).mockRejectedValueOnce(error)
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => {})

    await expect(setReadingProgress(library, 42, "epub", locator)).rejects.toBe(
      error,
    )

    consoleError.mockRestore()
  })
})
