import { narrationSourceKey } from "@my-reader/tools/narration-plan"
import { TtsBuffer } from "@my-reader/tools/tts-buffer"
import type {
  TtsPlaybackSegment,
  TtsSynthesisRequestEvent,
} from "@my-reader/readium"
import type { NarrationSpeech, TtsAudioArtifact } from "my-reader-core"
import {
  prepareBookNarration,
  type NarrationVoice,
} from "@/src/services/core/narration"
import { synthesizeTts } from "@/src/services/core/tts"
import { buildReaderTtsSynthesisRequest } from "./reader-tts"
import {
  loadNarrationChapter,
  matchNarrationRequest,
} from "./narration-chapter"
import {
  resolveNarrationPlayback,
  type NarrationBookContext,
} from "./narration-playback"

type Narration = {
  book: NarrationBookContext
  defaultVoice: NarrationVoice
  speech?: NarrationSpeech[]
}

/** Platform adapter: publishes cumulative snapshots while native audio keeps playing. */
export class ReaderAudioBuffer {
  private buffer?: TtsBuffer<NarrationSpeech, TtsAudioArtifact>
  private texts: string[] = []
  private keys: string[] = []
  private current = 0

  constructor(
    private readonly book?: NarrationBookContext,
    private readonly narration?: Narration | null,
    private readonly profiles: { id: string; revision: number }[] = [],
  ) {}

  setPlaying(playing: boolean) {
    this.buffer?.setPlaying(playing)
  }
  dispose() {
    this.buffer?.dispose()
    this.buffer = undefined
  }

  async *stream(
    request: TtsSynthesisRequestEvent,
    mimeTypes: string[],
    signal: AbortSignal,
  ) {
    const key = request.locator
      ? narrationSourceKey(request.locator)
      : request.text
    let index = this.keys.findIndex(
      (value, i) => value === key && this.texts[i] === request.text,
    )
    if (index < 0 && request.locator) {
      const source = matchNarrationRequest(
        this.keys.map((sourceKey, i) => ({ sourceKey, text: this.texts[i]! })),
        request.locator,
        request.text,
      )
      if (source?.text === request.text)
        index = this.keys.indexOf(source.sourceKey)
    }
    if (!this.buffer || index < this.current || index < 0) {
      await this.reset(request, mimeTypes, signal, key)
      index = 0
    }
    this.current = index
    const buffer = this.buffer!
    buffer.activate(index)
    const abort = () => {
      if (this.buffer === buffer) this.dispose()
    }
    signal.addEventListener("abort", abort, { once: true })
    const segments: TtsPlaybackSegment[] = []
    try {
      for (let part = 0; ; part++) {
        const chunk = await buffer.read(index, part)
        if (signal.aborted) return
        if (!chunk) {
          yield { segments, isFinal: true }
          return
        }
        segments.push({
          text: chunk.text,
          startUtf16: chunk.startUtf16,
          endUtf16: chunk.endUtf16,
          ...(chunk.context.voice.engine === "system"
            ? { systemVoiceId: chunk.context.voice.voiceId }
            : {
                path: chunk.audio!.path,
                timings: chunk.audio!.timings,
                playbackRate: chunk.audio!.playbackRate,
              }),
        })
        yield { segments: [...segments], isFinal: chunk.last }
        if (chunk.last) return
      }
    } finally {
      signal.removeEventListener("abort", abort)
    }
  }
  private async reset(
    request: TtsSynthesisRequestEvent,
    mimeTypes: string[],
    signal: AbortSignal,
    key: string,
  ) {
    this.dispose()
    const narration = this.narration
    const defaultVoice = narration?.defaultVoice ?? {
      engine: "provider",
      profileId: request.profileId,
      voiceId: request.voiceId,
    }
    const fallback = (text: string): NarrationSpeech[] => [
      {
        text,
        startUtf16: 0,
        endUtf16: text.length,
        voice: defaultVoice,
        instructions: "",
      },
    ]
    const resolved =
      narration && !narration.speech
        ? await resolveNarrationPlayback(
            narration.book,
            defaultVoice,
            request,
            signal,
          )
        : undefined
    const chapter =
      resolved?.chapter ??
      (this.book && request.locator && !narration?.speech
        ? await loadNarrationChapter(this.book, request.locator)
        : [])
    if (signal.aborted)
      throw Object.assign(new Error("Aborted"), { name: "AbortError" })
    const source = request.locator
      ? matchNarrationRequest(chapter, request.locator, request.text)
      : undefined
    const following = source ? chapter.slice(chapter.indexOf(source) + 1) : []
    this.keys = [key, ...following.map((unit) => unit.sourceKey)]
    this.texts = [request.text, ...following.map((unit) => unit.text)]
    this.buffer = new TtsBuffer({
      count: this.texts.length,
      rate: () => request.speed,
      load: async (index, signal) => {
        const unit = following[index - 1]
        const jobs =
          index === 0
            ? (narration?.speech ?? resolved?.jobs ?? fallback(request.text))
            : narration && unit
              ? await prepareBookNarration(
                  narration.book.library,
                  unit,
                  defaultVoice,
                  signal,
                )
              : fallback(this.texts[index]!)
        return jobs.map((job) => ({
          text: job.text,
          startUtf16: job.startUtf16,
          context: job,
          key: JSON.stringify([
            job.voice,
            this.profiles.find((profile) => profile.id === job.voice.profileId)
              ?.revision,
            job.instructions,
            request.language,
            request.speed,
            request.pitch,
          ]),
          language: request.language,
          system: job.voice.engine === "system",
        }))
      },
      synthesize: async (run, text, signal) => {
        const audio = await synthesizeTts(
          {
            ...buildReaderTtsSynthesisRequest(
              {
                ...request,
                text,
                profileId: run.context.voice.profileId!,
                voiceId: run.context.voice.voiceId,
              },
              mimeTypes,
            ),
            instructions: run.context.instructions || undefined,
          },
          { signal },
        )
        // Providers that synthesize at the requested speed play at 1x.
        return { ...audio, playbackRate: audio.playbackRate ?? 1 }
      },
    })
  }
}
