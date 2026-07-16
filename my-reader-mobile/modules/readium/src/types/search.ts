import type { Locator } from "./locator"

/** Readium REP-007 search options supported by the active publication. */
export interface SearchOptions {
  caseSensitive?: boolean
  diacriticSensitive?: boolean
  wholeWord?: boolean
  exact?: boolean
  language?: string
  regularExpression?: boolean
}

/**
 * Runtime search capabilities. An omitted option is unsupported by the
 * active native search service.
 */
export interface SearchCapabilities {
  searchable: boolean
  options: SearchOptions
}

/** Opaque handle to an active search iterator session. */
export interface SearchSession {
  id: string
  /** Match count, if known (may update as pages are fetched). */
  resultCount?: number
}

/** One page from the active REP-007 search iterator. */
export interface SearchResultPage {
  locators: Locator[]
  /** Match count, if known (it may increase as pages are fetched). */
  resultCount?: number
  done: boolean
}
