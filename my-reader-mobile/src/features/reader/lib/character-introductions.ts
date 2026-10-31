import {
  publication,
  search,
  type ContentResult,
  type Link,
  type Locator,
} from "@my-reader/readium"
import { hrefRoughlyMatches } from "@my-reader/tools/reader-toc"

const TERMS = [
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
const isIntroduction = (value: string) =>
  TERMS.some((term) =>
    /^[a-z]/.test(term)
      ? new RegExp(`\\b${term}\\b`, "i").test(value)
      : value.includes(term),
  )
const flatten = (links: Link[]): Link[] =>
  links.flatMap((link) => [link, ...flatten(link.children ?? [])])
export type CharacterIntroduction = { id: string; title: string; text: string }

export async function findCharacterIntroductions(
  publicationId: string,
  signal: AbortSignal,
): Promise<CharacterIntroduction[]> {
  const active = () => {
    if (signal.aborted)
      throw Object.assign(new Error("Aborted"), { name: "AbortError" })
  }
  const snapshot = await publication.getSnapshot(publicationId)
  active()
  const matches: Locator[] = flatten(snapshot.tableOfContents)
    .filter((link) => isIntroduction(link.title ?? ""))
    .map((link) => ({
      href: link.href,
      type: "application/xhtml+xml",
      title: link.title,
      locations: {},
    }))
  matches.push(...(await searchIntroductionLocators(publicationId, active)))
  const introductions: CharacterIntroduction[] = []
  const visited = new Set<string>()
  for (const locator of matches) {
    active()
    const id = locator.href.split("#")[0] ?? locator.href
    if (visited.has(id)) continue
    const introduction = await extractIntroduction(publicationId, locator, id)
    active()
    if (!introduction) continue
    visited.add(id)
    introductions.push(introduction)
    if (introductions.length === 12) break
  }
  return introductions
}

async function extractIntroduction(
  publicationId: string,
  locator: Locator,
  id: string,
): Promise<CharacterIntroduction | null> {
  const result = (await publication.getContent(
    publicationId,
    locator,
  )) as ContentResult & { content?: ContentResult["utterances"] }
  const passages = (result.utterances ?? result.content ?? []).filter((item) =>
    hrefRoughlyMatches(item.locator.href, locator.href),
  )
  const heading = passages[0]?.text.trim() ?? ""
  // A matching word in ordinary prose is not an introduction chapter.
  if (
    !isIntroduction(locator.title ?? "") &&
    !(heading.length < 160 && isIntroduction(heading))
  )
    return null
  const text = passages
    .map((item) => item.text)
    .join("\n")
    .slice(0, 12000)
    .trim()
  if (!text || (text === heading && isIntroduction(heading))) return null
  return {
    id,
    title: isIntroduction(locator.title ?? "") ? locator.title! : heading,
    text,
  }
}

async function searchIntroductionLocators(
  publicationId: string,
  active: () => void,
) {
  const matches: Locator[] = []
  const capabilities = await search.getCapabilities(publicationId)
  if (capabilities.searchable)
    for (const term of TERMS) {
      active()
      const session = await search.search(publicationId, term)
      try {
        for (let page = 0; page < 10; page += 1) {
          active()
          const result = await search.next(session.id)
          matches.push(...result.locators)
          if (result.done) break
        }
      } finally {
        await search.cancel(session.id)
      }
    }
  return matches
}
