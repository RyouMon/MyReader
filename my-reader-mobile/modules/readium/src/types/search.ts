import type { Locator } from './locator';

/**
 * Search service types (REP-007) — interface only, Phase 1 reserves the
 * extension point; full implementation is Phase 2.
 */
export interface SearchOptions {
  caseSensitive?: boolean;
  diacriticSensitive?: boolean;
  wholeWord?: boolean;
  exact?: boolean;
  language?: string;
  regularExpression?: boolean;
}

export interface SearchLocatorCollection {
  locators: Locator[];
}

/** Opaque handle to an active search iterator session. */
export interface SearchSession {
  id: string;
  /** Match count, if known (may update as pages are fetched). */
  resultCount?: number;
}
