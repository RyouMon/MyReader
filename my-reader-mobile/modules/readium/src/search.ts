import { ReadiumModule } from "./ReadiumModule"
import type {
  SearchOptions,
  SearchSession,
  SearchLocatorCollection,
} from "./types"

/**
 * Full-text search (REP-007) — interface reserved in Phase 1, full
 * implementation in Phase 2. Backed by Readium's SearchService (a
 * PublicationService registered via `PublicationServicesBuilder`).
 */
export function search(
  publicationId: string,
  query: string,
  options?: SearchOptions,
): Promise<SearchSession> {
  return ReadiumModule.search(publicationId, query, options)
}

/** Fetch the next page of results; resolves null at end of publication. */
export function next(
  sessionId: string,
): Promise<SearchLocatorCollection | null> {
  return ReadiumModule.searchNext(sessionId)
}
