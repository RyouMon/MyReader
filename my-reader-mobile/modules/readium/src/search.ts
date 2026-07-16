import { ReadiumModule } from "./ReadiumModule"
import type {
  SearchCapabilities,
  SearchOptions,
  SearchSession,
  SearchResultPage,
} from "./types"

/** Runtime capabilities of the publication's native REP-007 search service. */
export function getCapabilities(
  publicationId: string,
): Promise<SearchCapabilities> {
  return ReadiumModule.getSearchCapabilities(publicationId)
}

/** Start a search, replacing any active search for this publication. */
export function search(
  publicationId: string,
  query: string,
  options?: SearchOptions,
): Promise<SearchSession> {
  return ReadiumModule.search(publicationId, query, options)
}

/** Fetch the next result page. End of publication is represented by `done`. */
export function next(sessionId: string): Promise<SearchResultPage> {
  return ReadiumModule.searchNext(sessionId)
}

/** Close an active search iterator. Safe to call more than once. */
export function cancel(sessionId: string): Promise<void> {
  return ReadiumModule.searchCancel(sessionId)
}
