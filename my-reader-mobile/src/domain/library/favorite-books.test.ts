jest.mock("../sync/library-sidecar/favorite", () => ({
  writeLocalFavorite: jest.fn(),
}))

jest.mock("@/src/services/query/invalidate-table", () => ({
  invalidateFavoriteBooks: jest.fn(),
}))

import type { Library } from "@my-reader/tools/types/library"

import { invalidateFavoriteBooks } from "@/src/services/query/invalidate-table"
import { writeLocalFavorite } from "../sync/library-sidecar/favorite"
import { addFavoriteBook, removeFavoriteBook } from "./favorite-books"

const library = {
  id: "library-1",
  name: "Library",
  path: "file:///library",
  addedAt: 0,
  bookCount: 1,
  sourceType: "local",
} as Library

describe("favorite book actions", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.mocked(writeLocalFavorite).mockResolvedValue(undefined)
    jest.mocked(invalidateFavoriteBooks).mockResolvedValue(undefined)
  })

  it("should write a synchronized favorite before invalidating the list when a book is added", async () => {
    await addFavoriteBook(library, 42)

    expect(writeLocalFavorite).toHaveBeenCalledWith(library, 42, true)
    expect(invalidateFavoriteBooks).toHaveBeenCalledWith(library.id)
  })

  it("should write a synchronized tombstone before invalidating the list when a book is removed", async () => {
    await removeFavoriteBook(library, 42)

    expect(writeLocalFavorite).toHaveBeenCalledWith(library, 42, false)
    expect(invalidateFavoriteBooks).toHaveBeenCalledWith(library.id)
  })
})
