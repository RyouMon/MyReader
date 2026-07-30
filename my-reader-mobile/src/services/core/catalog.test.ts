jest.mock("../fs/path", () => ({
  toNativeFilesystemPath: (uri: string) => uri.replace("file://", ""),
}))
jest.mock("./transport", () => ({
  invokeCoreAsync: jest.fn(),
  invokeCoreSync: jest.fn(),
}))

import {
  getCalibreBookDetail,
  listCalibreBookFormats,
  listCalibreBooksPageByLastRead,
  listCalibreBookSummaries,
} from "./catalog"
import { invokeCoreAsync } from "./transport"

describe("core catalog adapter", () => {
  const mockInvokeCoreAsync = jest.mocked(invokeCoreAsync)

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("should return book detail when core returns a typed catalog record", async () => {
    mockInvokeCoreAsync.mockResolvedValue({
      id: 42,
      title: "The Left Hand of Darkness",
      titleSort: "Left Hand of Darkness, The",
      authorSort: "Le Guin, Ursula K.",
      authors: ["Ursula K. Le Guin"],
      tags: [],
      series: null,
      seriesIndex: null,
      formats: ["EPUB"],
      hasCover: true,
      path: "Ursula K. Le Guin/The Left Hand of Darkness",
      timestamp: null,
      pubdate: null,
      lastModified: null,
      comment: null,
      publisher: null,
      languages: [],
      rating: null,
      uuid: null,
      formatSizes: [{ format: "EPUB", sizeBytes: 1024 }],
      identifiers: [],
    })

    const detail = await getCalibreBookDetail("file:///library", 42)

    expect(mockInvokeCoreAsync).toHaveBeenCalledWith(
      "catalog",
      "getBookDetail",
      {
        libraryRootPath: "/library",
        bookId: 42,
      },
    )
    expect(detail.titleSort).toBe("Left Hand of Darkness, The")
    expect(detail.formatSizes).toEqual([{ format: "EPUB", sizeBytes: 1024 }])
  })

  it("should preserve relative file path when core returns book formats", async () => {
    mockInvokeCoreAsync.mockResolvedValue([
      {
        format: "EPUB",
        name: "The Left Hand of Darkness",
        sizeBytes: 1024,
        relativePath:
          "Ursula K. Le Guin/The Left Hand of Darkness/The Left Hand of Darkness.epub",
      },
    ])

    const formats = await listCalibreBookFormats("file:///library", 42)

    expect(formats).toEqual([
      {
        format: "EPUB",
        name: "The Left Hand of Darkness",
        sizeBytes: 1024,
        relativePath:
          "Ursula K. Le Guin/The Left Hand of Darkness/The Left Hand of Darkness.epub",
      },
    ])
  })

  it("should preserve format paths when core returns book summaries", async () => {
    mockInvokeCoreAsync.mockResolvedValue([
      {
        id: 42,
        path: "Ursula K. Le Guin/The Left Hand of Darkness",
        hasCover: true,
        formats: ["EPUB"],
        formatPaths: [
          "Ursula K. Le Guin/The Left Hand of Darkness/The Left Hand of Darkness.epub",
        ],
      },
    ])

    const summaries = await listCalibreBookSummaries("file:///library")

    expect(summaries[0]?.formatPaths).toEqual([
      "Ursula K. Le Guin/The Left Hand of Darkness/The Left Hand of Darkness.epub",
    ])
  })

  it("should delegate recent-book ordering when last-read page is requested", async () => {
    mockInvokeCoreAsync.mockResolvedValue({ items: [], total: 0 })

    await listCalibreBooksPageByLastRead(
      "file:///library",
      "file:///sidecar",
      0,
      20,
      "Earthsea",
    )

    expect(mockInvokeCoreAsync).toHaveBeenCalledWith(
      "catalog",
      "listBooksPageByLastRead",
      {
        libraryRootPath: "/library",
        sidecarRootPath: "/sidecar",
        offset: 0,
        limit: 20,
        search: "Earthsea",
      },
    )
  })
})
