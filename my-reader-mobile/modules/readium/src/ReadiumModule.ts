import { requireNativeModule } from "expo"

import type {
  Locator,
  PublicationOpenerConfig,
  FormatRegistration,
  PublicationSnapshot,
  ContentResult,
  SearchCapabilities,
  SearchOptions,
  SearchSession,
  SearchResultPage,
} from "./types"

/**
 * Typed binding to the native `Readium` Expo Module.
 *
 * View-tag-based navigation methods (goTo/goForward/goBackward) take the
 * React tag of a `ReadiumView` (via `findNodeHandle`); native looks up the
 * view instance and dispatches. The rest are module-level functions for the
 * open-architecture extension points (REP-003~007).
 */
export type ReadiumModuleMethods = {
  // Imperative navigation (view-tag based)
  goTo: (tag: number, locator: Locator) => void
  goForward: (tag: number) => void
  goBackward: (tag: number) => void
  clearSelection: (tag: number) => void
  getBookmarkLocator: (tag: number) => Promise<Locator | null>
  isBookmarkVisible: (tag: number, locator: Locator) => Promise<boolean>

  // Streamer / opener configuration (REP-005/006)
  configure: (config: PublicationOpenerConfig) => void
  registerFormat: (registration: FormatRegistration) => void

  // Publication handle operations (REP-003/004)
  getPublicationSnapshot: (id: string) => Promise<PublicationSnapshot>
  getContent: (id: string, fromLocator?: Locator) => Promise<ContentResult>

  // Search (REP-007)
  getSearchCapabilities: (publicationId: string) => Promise<SearchCapabilities>
  search: (
    publicationId: string,
    query: string,
    options?: SearchOptions,
  ) => Promise<SearchSession>
  searchNext: (sessionId: string) => Promise<SearchResultPage>
  searchCancel: (sessionId: string) => Promise<void>
}

export const ReadiumModule =
  requireNativeModule<ReadiumModuleMethods>("Readium")
