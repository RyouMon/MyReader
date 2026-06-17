import type { Link } from './link';
import type { Locator } from './locator';
import type { PublicationMetadata } from './publication';

/**
 * Opaque handle to a native `Publication` object (REP-003/004).
 *
 * Uses the id+handle pattern (not Expo SharedObject): native keeps a
 * `[id: Publication]` table; JS holds this id and calls module-level
 * AsyncFunctions (`getMetadata`, `getTOC`, `getPositions`, `getReadingOrder`,
 * `content`, ...) to inspect/operate on it.
 *
 * This is what unblocks TTS (content iteration), Search (service), and custom
 * services — all reachable through the held Publication.
 */
export interface PublicationHandle {
  id: string;
}

/**
 * A chunk of publication content (e.g. a sentence) extracted by Readium's
 * Content service + ContentTokenizer. The unit fed to any TTS engine, and
 * the data source for `publication.content()`.
 */
export interface Utterance {
  text: string;
  locator: Locator;
  language?: string;
}

/** Result of `publication.content(id, fromLocator?)` — a stream of utterances. */
export interface ContentResult {
  utterances: Utterance[];
}

/** Metadata accessors available on a Publication handle. */
export interface PublicationSnapshot {
  metadata: PublicationMetadata;
  tableOfContents: Link[];
  readingOrder: Link[];
  positions: Locator[];
}
