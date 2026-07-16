import type {
  ReaderSearchCapabilities,
  ReaderSearchOptions,
  ReaderSearchResultPage,
  ReaderSearchSession,
} from "@my-reader/tools/reader-search"
import {
  hrefRoughlyMatches,
  type ReaderLocator,
} from "@my-reader/tools/reader-toc"
import type { EpubTextResource } from "@/lib/readium/epubContentLocators"

const DEFAULT_PAGE_SIZE = 20
const SEARCH_CONTEXT_LENGTH = 32
const WORD_CHARACTER = /[\p{L}\p{N}_]/u
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

type SearchIndex = {
  text: string
  rawStarts: number[]
  rawEnds: number[]
}

type SearchSessionState = {
  query: string
  options: ReaderSearchOptions
  resourceIndex: number
  pendingLocators: ReaderLocator[]
  resultCount: number
}

let nextSessionNumber = 1

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

function elementCssSelector(element: Element): string {
  const parts: string[] = []
  let current: Element | null = element

  while (current && current !== current.ownerDocument.body) {
    const tag = current.tagName.toLowerCase()
    const siblings = current.parentElement
      ? Array.from(current.parentElement.children).filter(
          (sibling) => sibling.tagName === current?.tagName,
        )
      : []
    const index = siblings.indexOf(current)
    parts.unshift(`${tag}:nth-of-type(${Math.max(0, index) + 1})`)
    current = current.parentElement
  }

  return ["body", ...parts].join(" > ")
}

function transformCharacter(
  character: string,
  options: ReaderSearchOptions,
): string {
  let result = options.diacriticSensitive
    ? character
    : character.normalize("NFD").replace(/\p{M}/gu, "")
  if (!options.caseSensitive) {
    result = options.language
      ? result.toLocaleLowerCase(options.language)
      : result.toLocaleLowerCase()
  }
  return result
}

function createSearchIndex(
  rawText: string,
  options: ReaderSearchOptions,
): SearchIndex {
  const transformed: string[] = []
  const rawStarts: number[] = []
  const rawEnds: number[] = []
  let rawOffset = 0

  for (const character of rawText) {
    const rawEnd = rawOffset + character.length
    if (/\s/u.test(character)) {
      if (transformed[transformed.length - 1] === " ") {
        rawEnds[rawEnds.length - 1] = rawEnd
      } else {
        transformed.push(" ")
        rawStarts.push(rawOffset)
        rawEnds.push(rawEnd)
      }
      rawOffset = rawEnd
      continue
    }

    for (const transformedCharacter of transformCharacter(character, options)) {
      transformed.push(transformedCharacter)
      rawStarts.push(rawOffset)
      rawEnds.push(rawEnd)
    }
    rawOffset = rawEnd
  }

  return { text: transformed.join(""), rawStarts, rawEnds }
}

function normalizeQuery(query: string, options: ReaderSearchOptions): string {
  return createSearchIndex(query, options).text.trim()
}

function isWholeWord(text: string, start: number, end: number): boolean {
  const before = start > 0 ? text[start - 1] : undefined
  const after = end < text.length ? text[end] : undefined
  return (
    !(before && WORD_CHARACTER.test(before)) &&
    !(after && WORD_CHARACTER.test(after))
  )
}

function nearestPosition(
  positions: ReaderLocator[],
  resource: EpubTextResource,
  progression: number,
): ReaderLocator | undefined {
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
  return nearest
}

function searchElement(
  resource: EpubTextResource,
  element: Element,
  positions: ReaderLocator[],
  totalTextLength: number,
  query: string,
  options: ReaderSearchOptions,
): ReaderLocator[] {
  const rawText = element.textContent ?? ""
  const index = createSearchIndex(rawText, options)
  const normalizedQuery = normalizeQuery(query, options)
  if (!normalizedQuery) return []

  const progression = progressionBeforeElement(
    element.ownerDocument,
    element,
    totalTextLength,
  )
  const position = nearestPosition(positions, resource, progression)
  const fragment = element.id || element.closest<HTMLElement>("[id]")?.id
  const cssSelector = elementCssSelector(element)
  const locators: ReaderLocator[] = []
  let start = 0

  while (start <= index.text.length - normalizedQuery.length) {
    const matchStart = index.text.indexOf(normalizedQuery, start)
    if (matchStart < 0) break
    const matchEnd = matchStart + normalizedQuery.length
    start = matchStart + Math.max(1, normalizedQuery.length)
    if (options.wholeWord && !isWholeWord(index.text, matchStart, matchEnd)) {
      continue
    }

    const rawStart = index.rawStarts[matchStart]
    const rawEnd = index.rawEnds[matchEnd - 1]
    if (rawStart == null || rawEnd == null || rawEnd <= rawStart) continue

    locators.push({
      href: resource.href,
      type: resource.type,
      title: resource.title,
      locations: {
        progression,
        cssSelector,
        ...(fragment ? { fragments: [fragment] } : {}),
        ...(position?.locations?.position != null
          ? { position: position.locations.position }
          : {}),
        ...(position?.locations?.totalProgression != null
          ? { totalProgression: position.locations.totalProgression }
          : {}),
      },
      text: {
        before: rawText.slice(
          Math.max(0, rawStart - SEARCH_CONTEXT_LENGTH),
          rawStart,
        ),
        highlight: rawText.slice(rawStart, rawEnd),
        after: rawText.slice(
          rawEnd,
          Math.min(rawText.length, rawEnd + SEARCH_CONTEXT_LENGTH),
        ),
      },
    })
  }

  return locators
}

export function searchEpubTextResources(
  resources: EpubTextResource[],
  positions: ReaderLocator[],
  query: string,
  options: ReaderSearchOptions = {},
): ReaderLocator[] {
  const locators: ReaderLocator[] = []

  for (const resource of resources) {
    const doc = new DOMParser().parseFromString(resource.html, "text/html")
    const totalTextLength = normalizedText(doc.body?.textContent).length
    if (totalTextLength === 0) continue

    for (const element of contentTextBlocks(doc)) {
      locators.push(
        ...searchElement(
          resource,
          element,
          positions,
          totalTextLength,
          query,
          options,
        ),
      )
    }
  }

  return locators
}

export class EpubSearchService {
  private readonly sessions = new Map<string, SearchSessionState>()

  constructor(
    private readonly resources: EpubTextResource[],
    private readonly positions: ReaderLocator[],
    private readonly pageSize = DEFAULT_PAGE_SIZE,
  ) {}

  getCapabilities(): ReaderSearchCapabilities {
    return {
      searchable: this.resources.some((resource) => {
        const doc = new DOMParser().parseFromString(resource.html, "text/html")
        return Boolean(normalizedText(doc.body?.textContent))
      }),
      options: {
        caseSensitive: false,
        diacriticSensitive: false,
        wholeWord: false,
      },
    }
  }

  async start(
    query: string,
    options: ReaderSearchOptions = {},
  ): Promise<ReaderSearchSession> {
    const id = `epub-search-${nextSessionNumber++}`
    this.sessions.set(id, {
      query,
      options,
      resourceIndex: 0,
      pendingLocators: [],
      resultCount: 0,
    })
    return { id, resultCount: 0 }
  }

  async next(sessionId: string): Promise<ReaderSearchResultPage> {
    const state = this.sessions.get(sessionId)
    if (!state) throw new Error("Search session is closed")

    const locators: ReaderLocator[] = []
    while (locators.length < this.pageSize) {
      locators.push(
        ...state.pendingLocators.splice(0, this.pageSize - locators.length),
      )
      if (locators.length >= this.pageSize) break

      const resource = this.resources[state.resourceIndex]
      if (!resource) break
      state.resourceIndex += 1
      const resourceLocators = searchEpubTextResources(
        [resource],
        this.positions,
        state.query,
        state.options,
      )
      state.resultCount += resourceLocators.length
      state.pendingLocators.push(...resourceLocators)

      await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 0))
      if (!this.sessions.has(sessionId)) {
        throw new Error("Search session is closed")
      }
    }

    const done =
      state.resourceIndex >= this.resources.length &&
      state.pendingLocators.length === 0
    return {
      locators,
      resultCount: state.resultCount,
      done,
    }
  }

  async close(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId)
  }

  async closeAll(): Promise<void> {
    this.sessions.clear()
  }
}
