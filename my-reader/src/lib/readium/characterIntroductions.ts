import {
  hrefRoughlyMatches,
  type ReaderLocator,
  type ReaderTocItem,
} from "@my-reader/tools/reader-toc"
import type { EpubSearchService } from "./epubSearch"
import type { EpubTextResource } from "./epubContentLocators"

const INTRODUCTION_TERMS = [
  "人物介绍",
  "人物介紹",
  "人物简介",
  "人物簡介",
  "登场人物",
  "登場人物",
  "角色介绍",
  "角色介紹",
  "人物紹介",
  "characters",
  "dramatis personae",
  "cast",
]

export type CharacterIntroduction = {
  id: string
  title: string
  text: string
  locator: ReaderLocator
}

const isIntroduction = (text: string) =>
  INTRODUCTION_TERMS.some((term) =>
    /^[a-z]/.test(term)
      ? new RegExp(`\\b${term}\\b`, "i").test(text)
      : text.includes(term),
  )

export async function findCharacterIntroductions(
  service: Pick<EpubSearchService, "start" | "next" | "close">,
  resources: EpubTextResource[],
  toc: ReaderTocItem[],
): Promise<CharacterIntroduction[]> {
  const matches: ReaderLocator[] = toc
    .filter((item) => isIntroduction(item.label))
    .flatMap((item) =>
      item.locator
        ? [{ ...item.locator, title: item.label }]
        : item.href
          ? [
              {
                href: item.href,
                type: "application/xhtml+xml",
                title: item.label,
              },
            ]
          : [],
    )
  for (const term of INTRODUCTION_TERMS) {
    const session = await service.start(term)
    try {
      for (let page = 0; page < 10; page += 1) {
        const result = await service.next(session.id)
        matches.push(...result.locators)
        if (result.done) break
      }
    } finally {
      await service.close(session.id)
    }
  }
  const introductions = new Map<string, CharacterIntroduction>()
  for (const locator of matches) {
    const resource = resources.find((item) =>
      hrefRoughlyMatches(item.href, locator.href),
    )
    if (!resource) continue
    const passage = introductionPassage(resource, locator)
    if (passage && !introductions.has(passage.id))
      introductions.set(passage.id, passage)
  }
  return Array.from(introductions.values()).slice(0, 12)
}

function introductionPassage(
  resource: EpubTextResource,
  locator: ReaderLocator,
): CharacterIntroduction | null {
  const doc = new DOMParser().parseFromString(resource.html, "text/html")
  const located = locatorElement(doc, locator)
  const element =
    located ??
    Array.from(doc.querySelectorAll("h1,h2,h3,h4,h5,h6")).find((heading) =>
      isIntroduction(heading.textContent ?? ""),
    ) ??
    null
  doc
    .querySelectorAll("script, style, nav, [epub\\:type='toc']")
    .forEach((node) => node.remove())
  if (element && !element.isConnected) return null
  const context = introductionContext(
    element,
    locator.title || resource.title || "",
  )
  if (!context) return null
  const { heading, section, title } = context
  const text = introductionText(doc, heading, section)
  if (!text) return null
  return {
    id: `${resource.href}#${heading?.id || title}`,
    title,
    text,
    locator,
  }
}

function locatorElement(doc: Document, locator: ReaderLocator) {
  if (locator.locations?.cssSelector)
    return doc.querySelector(locator.locations.cssSelector)
  const fragment =
    locator.locations?.fragments?.[0] ?? locator.href.split("#")[1]
  if (!fragment) return null
  try {
    return doc.getElementById(decodeURIComponent(fragment))
  } catch {
    return doc.getElementById(fragment)
  }
}

function introductionContext(element: Element | null, resourceTitle: string) {
  const section = element?.matches("section, article") ? element : null
  const sectionHeading = section?.querySelector("h1,h2,h3,h4,h5,h6")
  const label =
    sectionHeading?.textContent?.trim() || element?.textContent?.trim() || ""
  const title = isIntroduction(resourceTitle) ? resourceTitle : label
  // A phrase in ordinary narrative is not evidence of an introduction section.
  const heading =
    sectionHeading ??
    (element &&
    !section &&
    (element.matches("h1,h2,h3,h4,h5,h6,[role='heading']") ||
      INTRODUCTION_TERMS.includes(label.toLocaleLowerCase()))
      ? element
      : null)
  if (!heading && !section && !isIntroduction(resourceTitle)) return null
  if (title.length > 160 || !isIntroduction(title)) return null
  return { heading, section, title }
}

function introductionText(
  doc: Document,
  heading: Element | null,
  section: Element | null,
) {
  const root = section ?? heading?.closest("section, article") ?? doc.body
  const range = doc.createRange()
  range.selectNodeContents(root)
  if (heading) {
    range.setStartAfter(heading)
    const level = Number(heading.tagName.substring(1)) || 1
    const next = Array.from(root.querySelectorAll("h1,h2,h3,h4,h5,h6")).find(
      (node) =>
        Boolean(
          heading.compareDocumentPosition(node) &
            Node.DOCUMENT_POSITION_FOLLOWING,
        ) && Number(node.tagName.substring(1)) <= level,
    )
    if (next) range.setEndBefore(next)
  }
  const content = range.cloneContents()
  content
    .querySelectorAll("p,div,li,dt,dd,tr,h1,h2,h3,h4,h5,h6,br")
    .forEach((node) => {
      node.after(doc.createTextNode("\n"))
    })
  return content.textContent?.trim() ?? ""
}
