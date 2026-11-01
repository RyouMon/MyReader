import { narrationSpeechForText } from "@my-reader/tools/narration-plan"
import type {
  Locator,
  TtsSynthesisRequestEvent,
  TtsPlaybackSegment,
} from "@my-reader/readium"
import type { Library } from "@my-reader/tools/types/library"
import { hrefRoughlyMatches } from "@my-reader/tools/reader-toc"
import {
  getBookNarration,
  prepareBookNarration,
  type NarrationVoice,
} from "@/src/services/core/narration"
import { synthesizeTts } from "@/src/services/core/tts"
import {
  buildReaderTtsSynthesisRequest,
  type ReaderTtsSelection,
} from "./reader-tts"
import { narrationTextContext } from "./narration-text-context"
import type { NarrationRequest, NarrationSpeech } from "my-reader-core"
import {
  analyzeNarrationChapter,
  matchNarrationRequest,
  narrationRequest,
} from "./narration-chapter"
import { NarrationPrefetchWindow } from "@my-reader/tools/narration-prefetch"

export type NarrationBookContext = {
  library: Library
  bookId: number
  contentVersion: string
  positions: Locator[]
  publicationId?: string
  chapters?: Map<string, Promise<NarrationRequest[]>>
  analysis?: Map<string, Promise<void>>
  prefetch?: NarrationPrefetchWindow
}

export async function prepareNarrationPlayback(
  book: NarrationBookContext,
  defaultVoice: NarrationVoice,
  request: TtsSynthesisRequestEvent,
  acceptedMimeTypes: string[],
  signal: AbortSignal,
  prefetch = true,
): Promise<TtsPlaybackSegment[]> {
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
  const segments = await prepareNarrationSpeech(
    source ? narrationSpeechForText(jobs, request.text) : jobs,
    request,
    acceptedMimeTypes,
    signal,
  )
  if (prefetch)
    prefetchNext(
      book,
      defaultVoice,
      source,
      chapter,
      request,
      acceptedMimeTypes,
      signal,
    )
  return segments
}

export async function prepareNarrationSpeech(
  jobs: NarrationSpeech[],
  request: TtsSynthesisRequestEvent,
  acceptedMimeTypes: string[],
  signal: AbortSignal,
): Promise<TtsPlaybackSegment[]> {
  const segments: TtsPlaybackSegment[] = []
  for (const job of jobs) {
    if (signal.aborted)
      throw Object.assign(new Error("Aborted"), { name: "AbortError" })
    const segment = {
      text: job.text,
      startUtf16: job.startUtf16,
      endUtf16: job.endUtf16,
    }
    if (job.voice.engine === "system") {
      segments.push({ ...segment, systemVoiceId: job.voice.voiceId })
      continue
    }
    if (!job.voice.profileId) throw new Error("TTS_PROFILE_NOT_FOUND")
    const artifact = await synthesizeTts(
      {
        ...buildReaderTtsSynthesisRequest(
          {
            ...request,
            text: job.text,
            profileId: job.voice.profileId,
            voiceId: job.voice.voiceId,
          },
          acceptedMimeTypes,
        ),
        instructions: job.instructions || undefined,
      },
      { signal },
    )
    segments.push({
      ...segment,
      path: artifact.path,
      timings: artifact.timings,
      playbackRate: artifact.playbackRate,
    })
  }
  return segments
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
        prefetch: new NarrationPrefetchWindow(),
      },
      defaultVoice,
    }
  }
  return { book, defaultVoice }
}

function prefetchNext(
  book: NarrationBookContext,
  defaultVoice: NarrationVoice,
  source: NarrationRequest | undefined,
  chapter: NarrationRequest[],
  request: TtsSynthesisRequestEvent,
  acceptedMimeTypes: string[],
  signal: AbortSignal,
) {
  if (source && !signal.aborted) {
    const index = chapter.indexOf(source)
    book.prefetch?.set(
      chapter.slice(index + 1, index + 3).map((next) => ({
        key: next.sourceKey,
        run: (signal) =>
          prepareNarrationPlayback(
            book,
            defaultVoice,
            {
              ...request,
              text: next.text,
              locator: JSON.parse(next.sourceKey) as Locator,
            },
            acceptedMimeTypes,
            signal,
            false,
          ),
      })),
    )
  }
}
