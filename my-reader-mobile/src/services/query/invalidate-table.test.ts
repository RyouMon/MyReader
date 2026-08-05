const mockSetQueryData = jest.fn()

jest.mock("./query-client", () => ({
  queryClient: {
    setQueryData: (...args: unknown[]) => mockSetQueryData(...args),
  },
}))

// Jest factories above must be registered before importing the module under test.
// eslint-disable-next-line import/first
import { cacheFileState } from "./invalidate-table"

describe("cacheFileState", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("should replace the cached row for the imported path", () => {
    const imported = {
      path: "Books/new/book.epub",
      isLocallyAvailable: true,
    }

    cacheFileState("library-1", imported)

    expect(mockSetQueryData).toHaveBeenCalledWith(
      ["file-states", "library-1"],
      expect.any(Function),
    )
    const update = mockSetQueryData.mock.calls[0]?.[1] as (
      current: (typeof imported)[],
    ) => (typeof imported)[]
    expect(
      update([
        { path: imported.path, isLocallyAvailable: false },
        { path: "Books/old/book.epub", isLocallyAvailable: true },
      ]),
    ).toEqual([
      imported,
      { path: "Books/old/book.epub", isLocallyAvailable: true },
    ])
  })
})
