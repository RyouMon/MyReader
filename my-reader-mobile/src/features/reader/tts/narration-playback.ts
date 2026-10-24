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

export type NarrationBookContext = {
  library: Library
  bookId: number
  contentVersion: string
  positions: Locator[]
}

export async function prepareNarrationPlayback(
  book: NarrationBookContext,
  defaultVoice: NarrationVoice,
  request: TtsSynthesisRequestEvent,
  acceptedMimeTypes: string[],
  signal: AbortSignal,
): Promise<TtsPlaybackSegment[]> {
  const locator = request.locator
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
          {
            bookId: book.bookId,
            contentVersion: book.contentVersion,
            sourceKey: JSON.stringify(locator),
            position,
            text: request.text,
            before: Array.from(locator.text?.before ?? "")
              .slice(-900)
              .join(""),
            after: Array.from(locator.text?.after ?? "")
              .slice(0, 900)
              .join(""),
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
  return { book, defaultVoice }
}
