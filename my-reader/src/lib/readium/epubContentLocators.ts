import {
  hrefRoughlyMatches,
  type ReaderContentElement,
  type ReaderLocator,
} from "@my-reader/tools/reader-toc"

export type EpubTextResource = {
  href: string
  type: string
  title?: string
  html: string
}

const TEXT_BLOCK_SELECTOR = [
  "address",
  "article",
  "aside",
  "blockquote",
  "caption",
  "dd",
  "div",
  "dt",
  "figcaption",
  "footer",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "li",
  "main",
  "nav",
  "p",
  "pre",
  "section",
  "td",
  "th",
  '[role="heading"]',
].join(",")

function normalizedText(text: string | null | undefined): string {
  return text?.replace(/\s+/g, " ").trim() ?? ""
}

function contentTextBlocks(doc: Document): Element[] {
  return Array.from(doc.querySelectorAll(TEXT_BLOCK_SELECTOR)).filter(
    (element) => {
      if (!normalizedText(element.textContent)) return false
      return !Array.from(element.children).some(
        (child) =>
          child.matches(TEXT_BLOCK_SELECTOR) &&
          Boolean(normalizedText(child.textContent)),
      )
    },
  )
}

function progressionBeforeElement(
  doc: Document,
  element: Element,
  totalTextLength: number,
): number {
  const body = doc.body
  if (!body || totalTextLength <= 0) return 0

  const range = doc.createRange()
  range.setStart(body, 0)
  range.setEndBefore(element)
  return Math.max(
    0,
    Math.min(1, normalizedText(range.toString()).length / totalTextLength),
  )
}

function locatorAtResourceProgression(
  resource: EpubTextResource,
  positions: ReaderLocator[],
  progression: number,
  fragment?: string,
): ReaderLocator {
  const resourcePositions = positions
    .filter((position) => hrefRoughlyMatches(position.href, resource.href))
    .sort(
      (a, b) =>
        (a.locations?.progression ?? 0) - (b.locations?.progression ?? 0),
    )
  let nearest = resourcePositions[0]
  for (const position of resourcePositions) {
    if ((position.locations?.progression ?? 0) > progression) break
    nearest = position
  }

  return {
    href: resource.href,
    type: resource.type,
    title: resource.title,
    locations: {
      progression,
      ...(fragment ? { fragments: [fragment] } : {}),
      ...(nearest?.locations?.position != null
        ? { position: nearest.locations.position }
        : {}),
      ...(nearest?.locations?.totalProgression != null
        ? { totalProgression: nearest.locations.totalProgression }
        : {}),
    },
  }
}

export function extractEpubContentLocators(
  resources: EpubTextResource[],
  positions: ReaderLocator[],
): ReaderContentElement[] {
  const contentElements: ReaderContentElement[] = []

  for (const resource of resources) {
    const doc = new DOMParser().parseFromString(resource.html, "text/html")
    const totalTextLength = normalizedText(doc.body?.textContent).length
    if (totalTextLength === 0) continue

    for (const element of contentTextBlocks(doc)) {
      const text = normalizedText(element.textContent)
      if (!text) continue
      const fragment = element.id || element.closest<HTMLElement>("[id]")?.id
      contentElements.push({
        text,
        locator: locatorAtResourceProgression(
          resource,
          positions,
          progressionBeforeElement(doc, element, totalTextLength),
          fragment || undefined,
        ),
      })
    }
  }

  return contentElements
}
