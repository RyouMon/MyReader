jest.mock("../fs/path", () => ({
  toNativeFilesystemPath: (uri: string) => uri.replace("file://", ""),
}))
jest.mock("my-reader-core", () => ({
  catalogGetBookFormat: jest.fn(),
  catalogGetBookDetail: jest.fn(),
  catalogListBookFormats: jest.fn(),
  catalogListBookSummaries: jest.fn(),
  catalogListBooksPageByLastRead: jest.fn(),
}))

import {
  catalogGetBookDetail,
  catalogGetBookFormat,
  catalogListBookFormats,
  catalogListBookSummaries,
  catalogListBooksPageByLastRead,
} from "my-reader-core"
import {
  getCalibreBookDetail,
  getCalibreBookFormat,
  listCalibreBookFormats,
  listCalibreBookSummaries,
  listCalibreBooksPageByLastRead,
} from "./catalog"

describe("core catalog adapter", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("should return book detail when core returns a typed catalog record", async () => {
    jest.mocked(catalogGetBookDetail).mockResolvedValue({
      id: 42,
      title: "The Left Hand of Darkness",
      titleSort: "Left Hand of Darkness, The",
      authorSort: "Le Guin, Ursula K.",
      authors: ["Ursula K. Le Guin"],
      tags: [],
      formats: ["EPUB"],
      readableFormats: ["EPUB"],
      hasCover: true,
      path: "Ursula K. Le Guin/The Left Hand of Darkness",
      languages: [],
      formatSizes: [{ format: "EPUB", sizeBytes: 1024 }],
      identifiers: [],
    })

    const detail = await getCalibreBookDetail("file:///library", 42)

    expect(catalogGetBookDetail).toHaveBeenCalledWith("/library", 42)
    expect(detail.series).toBeNull()
    expect(detail.preferredFormat).toBeNull()
    expect(detail.titleSort).toBe("Left Hand of Darkness, The")
    expect(detail.formatSizes).toEqual([{ format: "EPUB", sizeBytes: 1024 }])
  })

  it("should preserve relative file path when core returns book formats", async () => {
    jest.mocked(catalogListBookFormats).mockResolvedValue([
      {
        format: "EPUB",
        name: "The Left Hand of Darkness",
        sizeBytes: 1024,
        relativePath:
          "Ursula K. Le Guin/The Left Hand of Darkness/The Left Hand of Darkness.epub",
      },
    ])

    const formats = await listCalibreBookFormats("file:///library", 42)

    expect(formats[0]?.relativePath).toBe(
      "Ursula K. Le Guin/The Left Hand of Darkness/The Left Hand of Darkness.epub",
    )
  })

  it("should delegate single format resolution when one format is requested", async () => {
    jest.mocked(catalogGetBookFormat).mockResolvedValue({
      format: "EPUB",
      name: "The Left Hand of Darkness",
      sizeBytes: 1024,
      relativePath:
        "Ursula K. Le Guin/The Left Hand of Darkness/The Left Hand of Darkness.epub",
    })

    const format = await getCalibreBookFormat("file:///library", 42, "epub")

    expect(catalogGetBookFormat).toHaveBeenCalledWith("/library", 42, "epub")
    expect(format?.format).toBe("EPUB")
  })

  it("should preserve format paths when core returns book summaries", async () => {
    jest.mocked(catalogListBookSummaries).mockResolvedValue([
      {
        id: 42,
        path: "Ursula K. Le Guin/The Left Hand of Darkness",
        hasCover: true,
        formats: ["EPUB"],
        readableFormats: ["EPUB"],
        preferredFormat: "EPUB",
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
    jest
      .mocked(catalogListBooksPageByLastRead)
      .mockResolvedValue({ items: [], total: 0 })

    await listCalibreBooksPageByLastRead(
      "file:///library",
      "file:///sidecar",
      0,
      20,
      "Earthsea",
    )

    expect(catalogListBooksPageByLastRead).toHaveBeenCalledWith(
      "/library",
      "/sidecar",
      0,
      20,
      "Earthsea",
    )
  })
})
