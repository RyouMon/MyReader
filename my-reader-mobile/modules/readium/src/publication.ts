import { ReadiumModule } from "./ReadiumModule"
import type { Locator, PublicationSnapshot, ContentResult } from "./types"

/**
 * Publication handle operations (REP-003/004).
 *
 * A `publicationId` is obtained from `ReadiumView`'s `onPublicationReady`
 * event. Through it the JS side can read metadata/TOC/positions/readingOrder
 * and — critically for TTS — iterate content as utterances.
 */

/** Full snapshot of a publication (metadata, TOC, reading order, positions). */
export function getSnapshot(
  publicationId: string,
): Promise<PublicationSnapshot> {
  return ReadiumModule.getPublicationSnapshot(publicationId)
}

/**
 * Iterate publication content as utterances (text + locator + language),
 * starting from `fromLocator` if given. This is the path-agnostic TTS
 * foundation — any future TTS engine (JS / iOS native / Android native)
 * consumes this stream.
 */
export function getContent(
  publicationId: string,
  fromLocator?: Locator,
): Promise<ContentResult> {
  return ReadiumModule.getContent(publicationId, fromLocator)
}
