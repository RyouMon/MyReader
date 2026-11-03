import { narrationSpeechForText } from "@my-reader/tools/narration-plan"
import type { Locator, TtsSynthesisRequestEvent } from "@my-reader/readium"
import type { Library } from "@my-reader/tools/types/library"
import { hrefRoughlyMatches } from "@my-reader/tools/reader-toc"
import {
  getBookNarration,
  prepareBookNarration,
  type NarrationVoice,
} from "@/src/services/core/narration"
import { type ReaderTtsSelection } from "./reader-tts"
import { narrationTextContext } from "./narration-text-context"
import type { NarrationRequest } from "my-reader-core"
import {
  analyzeNarrationChapter,
  matchNarrationRequest,
  narrationRequest,
} from "./narration-chapter"

export type NarrationBookContext = {
  library: Library
  bookId: number
  contentVersion: string
  positions: Locator[]
  publicationId?: string
  chapters?: Map<string, Promise<NarrationRequest[]>>
  analysis?: Map<string, Promise<void>>
}

export async function resolveNarrationPlayback(
  book: NarrationBookContext,
  defaultVoice: NarrationVoice,
  request: TtsSynthesisRequestEvent,
  signal: AbortSignal,
) {
  const locator = request.locator
  const chapter = locator
    ? await analyzeNarrationChapter(book, locator, signal)
    : []
  const source = locator
    ? matchNarrationRequest(chapter, locator, request.text)
    : undefined
  const hrefs = [...new Set(book.positions.map((position) => position.href))]
  const resource = locator
    ? hrefs.findIndex((href) => hrefRoughlyMatches(href, locator.href))
    : -1
  const position =
    locator?.locations?.totalProgression ??
    (resource >= 0
      ? (resource + (locator?.locations?.progression ?? 0)) / hrefs.length
      : undefined)
  const jobs =
    locator && position !== undefined
      ? await prepareBookNarration(
          book.library,
          source ?? {
            bookId: book.bookId,
            contentVersion: book.contentVersion,
            sourceKey: narrationRequest(book, locator, request.text).sourceKey,
            position,
            text: request.text,
            ...narrationTextContext(
              chapter.map((unit) => ({
                text: unit.text,
                locator: JSON.parse(unit.sourceKey) as Locator,
              })),
              locator,
              request.text,
            ),
          },
          defaultVoice,
          signal,
        )
      : [
          {
            text: request.text,
            startUtf16: 0,
            endUtf16: request.text.length,
            voice: defaultVoice,
            instructions: "",
          },
        ]
  return {
    jobs: source ? narrationSpeechForText(jobs, request.text) : jobs,
    source,
    chapter,
  }
}

export async function loadNarrationContext(
  book: NarrationBookContext | undefined,
  selection: ReaderTtsSelection,
) {
  if (!book || !(await getBookNarration(book.library, book.bookId)).enabled)
    return null
  const defaultVoice: NarrationVoice = {
    engine: selection.kind,
    profileId: selection.kind === "provider" ? selection.profile.id : undefined,
    voiceId: selection.voiceId ?? "",
  }
  if (book.publicationId) {
    return {
      book: {
        ...book,
        chapters: new Map(),
        analysis: new Map(),
      },
      defaultVoice,
    }
  }
  return { book, defaultVoice }
}
