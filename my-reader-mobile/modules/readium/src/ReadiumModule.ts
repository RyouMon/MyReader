import { requireNativeModule } from "expo"

import type {
  Locator,
  PublicationOpenerConfig,
  FormatRegistration,
  PublicationSnapshot,
  ContentResult,
  SearchOptions,
  SearchSession,
  SearchLocatorCollection,
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

  // Streamer / opener configuration (REP-005/006)
  configure: (config: PublicationOpenerConfig) => void
  registerFormat: (registration: FormatRegistration) => void

  // Publication handle operations (REP-003/004)
  getPublicationSnapshot: (id: string) => Promise<PublicationSnapshot>
  getContent: (id: string, fromLocator?: Locator) => Promise<ContentResult>

  // Search (REP-007, reserved — Phase 2)
  search: (
    publicationId: string,
    query: string,
    options?: SearchOptions,
  ) => Promise<SearchSession>
  searchNext: (sessionId: string) => Promise<SearchLocatorCollection | null>
}

export const ReadiumModule =
  requireNativeModule<ReadiumModuleMethods>("Readium")
