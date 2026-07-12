import { afterEach, describe, expect, it, vi } from "vitest"
import { buildReadiumManifest } from "../readium/epubManifest"

type ManifestTocEntry = {
  href: string
  title: string
  children?: ManifestTocEntry[]
}

type ManifestWithToc = {
  toc?: ManifestTocEntry[]
}

function stubEpubFetch(files: Record<string, string>): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input)
      const text = files[path]
      if (text == null) {
        return new Response("not found", { status: 404 })
      }
      return new Response(text, { status: 200 })
    }),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("buildReadiumManifest", () => {
  it("should preserve nested toc titles when building the readium manifest", async () => {
    stubEpubFetch({
      "/book/META-INF/container.xml": `<?xml version="1.0" encoding="UTF-8"?>
        <container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
          <rootfiles>
            <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
          </rootfiles>
        </container>`,
      "/book/OEBPS/content.opf": `<?xml version="1.0" encoding="UTF-8"?>
        <package xmlns:dc="http://purl.org/dc/elements/1.1/">
          <metadata>
            <dc:title>Demo Book</dc:title>
            <dc:language>zh-CN</dc:language>
          </metadata>
          <manifest>
            <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
            <item id="chapter1" href="Text/chapter1.xhtml" media-type="application/xhtml+xml"/>
            <item id="chapter2" href="Text/chapter2.xhtml" media-type="application/xhtml+xml"/>
          </manifest>
          <spine toc="ncx">
            <itemref idref="chapter1"/>
            <itemref idref="chapter2"/>
          </spine>
        </package>`,
      "/book/OEBPS/toc.ncx": `<?xml version="1.0" encoding="UTF-8"?>
        <ncx>
          <navMap>
            <navPoint>
              <navLabel><text>正文</text></navLabel>
              <content src="Text/chapter1.xhtml"/>
              <navPoint>
                <navLabel><text>第1话 新学年的开始</text></navLabel>
                <content src="Text/chapter1.xhtml"/>
              </navPoint>
              <navPoint>
                <navLabel><text>第2话 与王子大人的接触</text></navLabel>
                <content src="Text/chapter2.xhtml"/>
              </navPoint>
            </navPoint>
          </navMap>
        </ncx>`,
    })

    const result = await buildReadiumManifest("/book")

    expect(result).not.toBeNull()
    const manifest = result?.manifest as ManifestWithToc
    expect(manifest.toc?.[0]).toMatchObject({
      href: "OEBPS/Text/chapter1.xhtml",
      title: "正文",
      children: [
        {
          href: "OEBPS/Text/chapter1.xhtml",
          title: "第1话 新学年的开始",
        },
        {
          href: "OEBPS/Text/chapter2.xhtml",
          title: "第2话 与王子大人的接触",
        },
      ],
    })
  })
})
