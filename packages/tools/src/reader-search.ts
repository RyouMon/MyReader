import {
  positionIndexForLocator,
  type ReaderLocator,
  type ReaderTocItem,
  resolveReaderToc,
} from "./reader-toc"

/**
 * Readium REP-007 search options. An omitted capability option is unsupported
 * by the active publication search service.
 */
export interface ReaderSearchOptions {
  caseSensitive?: boolean
  diacriticSensitive?: boolean
  wholeWord?: boolean
  exact?: boolean
  language?: string
  regularExpression?: boolean
}

export interface ReaderSearchCapabilities {
  searchable: boolean
  options: ReaderSearchOptions
}

export interface ReaderSearchSession {
  id: string
  resultCount?: number
}

export interface ReaderSearchResultPage {
  locators: ReaderLocator[]
  resultCount?: number
  done: boolean
}

export interface ReaderSearchResultMetadata {
  title?: string
  position?: number
}

export interface ReaderSearchSnippet {
  before: string
  highlight: string
  after: string
}

export interface ReaderSearchResultItem {
  locator: ReaderLocator
  title: string
  position?: number
  snippet: ReaderSearchSnippet
}

export type ResolveReaderSearchResultMetadataInput = {
  locator: ReaderLocator
  toc?: ReaderTocItem[]
  positions?: ReaderLocator[]
  fallbackTitle?: string
}

export type ResolveReaderSearchResultsInput = {
  locators: ReaderLocator[]
  toc?: ReaderTocItem[]
  positions?: ReaderLocator[]
  fallbackTitle?: string
}

function finiteNumber(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function normalizedSnippetPart(value: string | undefined): string {
  return value?.replace(/\s+/g, " ") ?? ""
}

/** Keeps the match inside a two-line preview instead of letting long context hide it. */
export function compactReaderSearchSnippet(
  locator: ReaderLocator,
  beforeLength = 36,
  afterLength = 64,
): ReaderSearchSnippet {
  const rawBefore = normalizedSnippetPart(locator.text?.before)
  const rawAfter = normalizedSnippetPart(locator.text?.after)
  return {
    before:
      rawBefore.length > beforeLength
        ? `…${rawBefore.slice(-beforeLength)}`
        : rawBefore,
    highlight: normalizedSnippetPart(locator.text?.highlight),
    after:
      rawAfter.length > afterLength
        ? `${rawAfter.slice(0, afterLength)}…`
        : rawAfter,
  }
}

/**
 * Resolves the user-facing chapter and target position for a search hit.
 * Native Readium search locators do not always contain a `position`, so the
 * nearest publication position in the same resource is used when necessary.
 */
export function resolveReaderSearchResultMetadata({
  locator,
  toc = [],
  positions = [],
  fallbackTitle,
}: ResolveReaderSearchResultMetadataInput): ReaderSearchResultMetadata {
  const positionIndex =
    positions.length > 0
      ? positionIndexForLocator(positions, locator)
      : undefined
  const title =
    resolveReaderToc({
      toc,
      positions,
      locator,
      currentPage: positionIndex,
      fallbackTitle: locator.title ?? fallbackTitle,
    }).title?.trim() ||
    locator.title?.trim() ||
    fallbackTitle?.trim() ||
    undefined
  const explicitPosition = locator.locations?.position
  const position =
    finiteNumber(explicitPosition) && explicitPosition >= 1
      ? explicitPosition
      : positionIndex == null
        ? undefined
        : (positions[positionIndex]?.locations?.position ?? positionIndex + 1)

  return { title, position }
}

/** Produces the same chapter, position and preview model for every UI surface. */
export function resolveReaderSearchResults({
  locators,
  toc = [],
  positions = [],
  fallbackTitle,
}: ResolveReaderSearchResultsInput): ReaderSearchResultItem[] {
  return locators.map((locator) => {
    const metadata = resolveReaderSearchResultMetadata({
      locator,
      toc,
      positions,
      fallbackTitle,
    })
    return {
      locator,
      title: metadata.title ?? fallbackTitle?.trim() ?? "",
      position: metadata.position,
      snippet: compactReaderSearchSnippet(locator),
    }
  })
}
