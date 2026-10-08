import type { Locator } from "@my-reader/readium"
import { resolveNativeLocator } from "@my-reader/tools/reader-toc"
import { resolveReaderStart } from "./reader-publication-state"

it("restores the precise resource offset instead of its coarse position", () => {
  const coarse: Locator = {
    href: "EPUB/chapter.xhtml",
    type: "application/xhtml+xml",
    locations: { position: 3, progression: 0, totalProgression: 0.3 },
  }
  const stored: Locator = {
    ...coarse,
    href: "/EPUB/chapter.xhtml",
    locations: { position: 99, progression: 0.5, fragments: ["page-two"] },
    text: { highlight: "Second page" },
  }
  const result = resolveReaderStart(
    [coarse],
    stored,
    null,
    resolveNativeLocator,
  )
  expect(result.source).toBe("stored-progress")
  expect(result.locator).toMatchObject({
    href: coarse.href,
    locations: { position: 3, progression: 0.5, fragments: ["page-two"] },
    text: stored.text,
  })
})
