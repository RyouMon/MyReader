/**
 * Custom format registration (REP-005 PublicationParser).
 *
 * Readium does not support MOBI/AZW3 etc. natively. To read such a format,
 * a native `PublicationParser` (Swift/Kotlin) is implemented and registered
 * under a `parserModule` id; JS declares the format's file extensions and
 * media type so the Streamer's sniffer can route to it.
 *
 * JS cannot perform binary parsing — `parserModule` always points to native.
 * Built-in MOBI/AZW3 parsers land in Phase 2; Phase 1 ships the registration
 * API + a sample parser to prove the link end-to-end.
 */
export interface FormatRegistration {
  id: string;
  /** File extensions (without dot), e.g. ['mobi', 'azw3']. */
  extensions: string[];
  /** Media type, e.g. 'application/x-mobipocket-ebook'. */
  mediaType?: string;
  /** Native parser module id implementing `PublicationParser`. */
  parserModule: string;
}
