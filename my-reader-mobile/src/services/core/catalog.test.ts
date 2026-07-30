jest.mock("../fs/path", () => ({
  toNativeFilesystemPath: (uri: string) => uri.replace("file://", ""),
}))

import MyReaderRustComponents from "@/modules/myreader-rust-components"
import {
  getCalibreBookDetail,
  listCalibreBookFormats,
  listCalibreBooksPageByLastRead,
  listCalibreBookSummaries,
} from "./catalog"

describe("core catalog adapter", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("should parse book detail when core returns catalog JSON", async () => {
    jest
      .spyOn(MyReaderRustComponents, "getCalibreBookDetail")
      .mockResolvedValue(
        JSON.stringify({
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
        }),
      )

    const detail = await getCalibreBookDetail("file:///library", 42)

    expect(MyReaderRustComponents.getCalibreBookDetail).toHaveBeenCalledWith(
      "/library",
      42,
    )
    expect(detail.titleSort).toBe("Left Hand of Darkness, The")
    expect(detail.formatSizes).toEqual([{ format: "EPUB", sizeBytes: 1024 }])
  })

  it("should preserve relative file path when core returns book formats", async () => {
    jest
      .spyOn(MyReaderRustComponents, "listCalibreBookFormats")
      .mockResolvedValue(
        JSON.stringify([
          {
            format: "EPUB",
            name: "The Left Hand of Darkness",
            sizeBytes: 1024,
            relativePath:
              "Ursula K. Le Guin/The Left Hand of Darkness/The Left Hand of Darkness.epub",
          },
        ]),
      )

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
    jest
      .spyOn(MyReaderRustComponents, "listCalibreBookSummaries")
      .mockResolvedValue(
        JSON.stringify([
          {
            id: 42,
            path: "Ursula K. Le Guin/The Left Hand of Darkness",
            hasCover: true,
            formats: ["EPUB"],
            formatPaths: [
              "Ursula K. Le Guin/The Left Hand of Darkness/The Left Hand of Darkness.epub",
            ],
          },
        ]),
      )

    const summaries = await listCalibreBookSummaries("file:///library")

    expect(summaries[0]?.formatPaths).toEqual([
      "Ursula K. Le Guin/The Left Hand of Darkness/The Left Hand of Darkness.epub",
    ])
  })

  it("should delegate recent-book ordering when last-read page is requested", async () => {
    jest
      .spyOn(MyReaderRustComponents, "listCalibreBooksPageByLastRead")
      .mockResolvedValue(JSON.stringify({ items: [], total: 0 }))

    await listCalibreBooksPageByLastRead(
      "file:///library",
      "file:///sidecar",
      0,
      20,
      "Earthsea",
    )

    expect(
      MyReaderRustComponents.listCalibreBooksPageByLastRead,
    ).toHaveBeenCalledWith("/library", "/sidecar", 0, 20, "Earthsea")
  })
})
