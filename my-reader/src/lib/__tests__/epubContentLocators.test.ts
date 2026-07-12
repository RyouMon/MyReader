import {
  enhanceTocItemsWithContentLocators,
  linksToTocItems,
  resolveReaderToc,
  type ReaderLocator,
} from "@my-reader/tools/reader-toc"
import { describe, expect, it } from "vitest"
import { extractEpubContentLocators } from "../readium/epubContentLocators"

function locator(position: number, progression: number): ReaderLocator {
  return {
    href: "OEBPS/Text/chapter-3.xhtml",
    type: "application/xhtml+xml",
    locations: { position, progression },
  }
}

describe("extractEpubContentLocators", () => {
  it("should locate nested chapters when they share one xhtml resource", () => {
    const positions = Array.from({ length: 8 }, (_, index) =>
      locator(index + 1, index / 8),
    )
    const toc = linksToTocItems(
      [
        {
          href: "Text/chapter-3.xhtml",
          title: "第三章 情绪Emotion",
          children: [
            { href: "Text/chapter-3.xhtml", title: "敬畏的力量" },
            { href: "Text/chapter-3.xhtml", title: "聚焦于情感" },
          ],
        },
      ],
      positions,
    )
    const content = extractEpubContentLocators(
      [
        {
          href: "OEBPS/Text/chapter-3.xhtml",
          type: "application/xhtml+xml",
          html: `
            <html><body>
              <h1>第三章 情绪Emotion</h1>
              <p>◆敬畏的力量</p>
              <p>◆聚焦于情感</p>
              <p>开篇正文。</p>
              <h2 id="section-5">敬畏的力量</h2>
              <p>${"第一节正文。".repeat(40)}</p>
              <h2 id="section-6">聚焦于情感</h2>
              <p>${"第二节正文。".repeat(20)}</p>
            </body></html>
          `,
        },
      ],
      positions,
    )
    const enhanced = enhanceTocItemsWithContentLocators(toc, content)
    const secondSection = enhanced[2]

    expect(secondSection?.locatorSource).toBe("content")
    expect(secondSection?.locator?.locations?.progression).toBeGreaterThan(0.5)
    expect(
      resolveReaderToc({
        toc: enhanced,
        positions,
        locator: locator(
          secondSection?.locator?.locations?.position ?? 1,
          secondSection?.locator?.locations?.progression ?? 0,
        ),
      }).item?.id,
    ).toBe(secondSection?.id)
  })
})
