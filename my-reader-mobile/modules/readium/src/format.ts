import { ReadiumModule } from "./ReadiumModule"
import type { FormatRegistration } from "./types"

/**
 * Register a custom publication format (REP-005 PublicationParser).
 *
 * The parser itself is implemented in native (Swift/Kotlin) under
 * `registration.parserModule`; JS only declares extensions/mediaType so the
 * Streamer sniffer can route to it. Use to support MOBI/AZW3 etc.
 * (Readium has no built-in support for those.)
 */
export function registerFormat(registration: FormatRegistration): void {
  ReadiumModule.registerFormat(registration)
}
