import type { ReaderLocator } from "@my-reader/tools/reader-toc"
import { describe, expect, it } from "vitest"
import type { EpubTextResource } from "../epubContentLocators"
import { EpubSearchService, searchEpubTextResources } from "../epubSearch"

const resources: EpubTextResource[] = [
  {
    href: "chapter-1.xhtml",
    type: "application/xhtml+xml",
    title: "Chapter 1",
    html: `
      <html><body>
        <p id="opening">The café is open. A CAFE owner waits.</p>
        <p>Searching whole words avoids researching.</p>
      </body></html>
    `,
  },
]

const positions: ReaderLocator[] = [
  {
    href: "chapter-1.xhtml",
    type: "application/xhtml+xml",
    locations: { progression: 0, position: 1, totalProgression: 0 },
  },
]

describe("EpubSearchService", () => {
  it("should return contextual Readium locators when EPUB text matches", () => {
    const results = searchEpubTextResources(resources, positions, "cafe")

    expect(results).toHaveLength(2)
    expect(results[0]).toMatchObject({
      href: "chapter-1.xhtml",
      title: "Chapter 1",
      locations: {
        fragments: ["opening"],
        position: 1,
        cssSelector: "body > p:nth-of-type(1)",
      },
      text: { highlight: "café" },
    })
    expect(results[1]?.text?.highlight).toBe("CAFE")
  })

  it("should honor case diacritic and whole-word options when searching", () => {
    expect(
      searchEpubTextResources(resources, positions, "cafe", {
        caseSensitive: true,
      }),
    ).toHaveLength(1)
    expect(
      searchEpubTextResources(resources, positions, "cafe", {
        caseSensitive: true,
        diacriticSensitive: true,
      }),
    ).toHaveLength(0)
    expect(
      searchEpubTextResources(resources, positions, "cafe", {
        diacriticSensitive: true,
      }),
    ).toHaveLength(1)
    expect(
      searchEpubTextResources(resources, positions, "search", {
        wholeWord: true,
      }),
    ).toHaveLength(0)
    expect(
      searchEpubTextResources(resources, positions, "searching", {
        wholeWord: true,
      }),
    ).toHaveLength(1)
  })

  it("should page results and reject reads after a session closes", async () => {
    const pagedResources: EpubTextResource[] = [
      {
        ...resources[0],
        html: "<html><body><p>The café is open.</p></body></html>",
      },
      {
        ...resources[0],
        href: "chapter-2.xhtml",
        title: "Chapter 2",
        html: "<html><body><p>A CAFE owner waits.</p></body></html>",
      },
    ]
    const service = new EpubSearchService(pagedResources, positions, 1)
    const session = await service.start("cafe")

    expect(session.resultCount).toBe(0)
    await expect(service.next(session.id)).resolves.toMatchObject({
      locators: [{ text: { highlight: "café" } }],
      resultCount: 1,
      done: false,
    })
    await expect(service.next(session.id)).resolves.toMatchObject({
      locators: [{ text: { highlight: "CAFE" } }],
      resultCount: 2,
      done: true,
    })

    await service.close(session.id)
    await expect(service.next(session.id)).rejects.toThrow(
      "Search session is closed",
    )
  })

  it("should report runtime capability when the publication contains text", () => {
    const service = new EpubSearchService(resources, positions)
    const emptyService = new EpubSearchService(
      [{ ...resources[0], html: "<html><body> </body></html>" }],
      positions,
    )

    expect(service.getCapabilities()).toEqual({
      searchable: true,
      options: {
        caseSensitive: false,
        diacriticSensitive: false,
        wholeWord: false,
      },
    })
    expect(emptyService.getCapabilities().searchable).toBe(false)
  })
})
