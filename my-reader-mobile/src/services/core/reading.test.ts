jest.mock("@/modules/myreader-rust-components", () => ({
  __esModule: true,
  default: {
    listFavoriteBookIds: jest.fn(),
    setFavoriteBook: jest.fn(),
  },
}))

jest.mock("@/src/domain/library/local-library-content", () => ({
  withLocalLibraryCalibreRoot: jest.fn(
    async (_library: unknown, operation: (root: string) => Promise<unknown>) =>
      operation("file:///library"),
  ),
}))

jest.mock("../fs/library-paths", () => ({
  librarySidecarRootUri: jest.fn(() => "file:///sidecar"),
}))

jest.mock("../fs/path", () => ({
  toNativeFilesystemPath: jest.fn((path: string) =>
    path.replace("file://", ""),
  ),
}))

import type { Library } from "@my-reader/tools/types/library"
import MyReaderRustComponents from "@/modules/myreader-rust-components"
import { listFavoriteBookIds, setFavoriteBook } from "./reading"

const library = { id: "library-1" } as Library

describe("core reading adapter", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(Date, "now").mockReturnValue(900)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it("should decode favorite IDs when core returns a projection", async () => {
    jest
      .mocked(MyReaderRustComponents.listFavoriteBookIds)
      .mockResolvedValue("[7,42]")

    await expect(listFavoriteBookIds(library)).resolves.toEqual([7, 42])
    expect(MyReaderRustComponents.listFavoriteBookIds).toHaveBeenCalledWith(
      "/sidecar",
    )
  })

  it("should pass both library roots when favorite state changes", async () => {
    jest
      .mocked(MyReaderRustComponents.setFavoriteBook)
      .mockResolvedValue(undefined)

    await setFavoriteBook(library, 42, true)

    expect(MyReaderRustComponents.setFavoriteBook).toHaveBeenCalledWith(
      "/sidecar",
      "/library",
      42,
      true,
      900,
    )
  })
})
