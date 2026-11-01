import {
  WebSpeechEngine,
  type ReadiumSpeechPlaybackEngine,
  type ReadiumSpeechPlaybackEvent,
  type ReadiumSpeechPlaybackState,
  type ReadiumSpeechUtterance,
  type ReadiumSpeechVoice,
} from "@readium/speech"
import { CoreSpeechEngine, ACCEPTED_MIME_TYPES } from "./CoreSpeechEngine"
import { NarrationPrefetchWindow } from "@my-reader/tools/narration-prefetch"
import { api } from "@/lib/tauri-api"
import type { NarrationSpeechDto, TtsVoiceRefDto } from "@/lib/tauri-specta"

type Prepare = (
  utterance: ReadiumSpeechUtterance,
  voice: TtsVoiceRefDto,
  signal: AbortSignal,
) => Promise<NarrationSpeechDto[]>

async function selectVoice(
  engine: ReadiumSpeechPlaybackEngine,
  voice: TtsVoiceRefDto,
) {
  if (voice.engine === "system" && !voice.voiceId) return
  // Readium's WebSpeechEngine string selector accepts names/languages, not native voice IDs.
  const selected =
    voice.engine === "system"
      ? (await engine.getAvailableVoices()).find((candidate) =>
          [
            candidate.identifier,
            candidate.voiceURI,
            candidate.originalName,
            candidate.name,
          ].includes(voice.voiceId),
        )
      : undefined
  await engine.setVoice(selected ?? voice.voiceId)
}

/** One Readium utterance remains one playback unit, even across several voices. */
export class NarrationSpeechEngine implements ReadiumSpeechPlaybackEngine {
  private utterances: ReadiumSpeechUtterance[] = []
  private index = 0
  private state: ReadiumSpeechPlaybackState = "idle"
  private controller: AbortController | null = null
  private active: ReadiumSpeechPlaybackEngine | null = null
  private listeners = new Map<
    ReadiumSpeechPlaybackEvent["type"],
    Set<(event: ReadiumSpeechPlaybackEvent) => void>
  >()
  private generation = 0
  private paused = false
  private ahead = new NarrationPrefetchWindow()

  constructor(
    private readonly base: ReadiumSpeechPlaybackEngine,
    private readonly profileId: string | undefined,
    private readonly prepare: Prepare,
    private readonly createEngine = (
      segment: NarrationSpeechDto,
    ): ReadiumSpeechPlaybackEngine =>
      segment.voice.engine === "system"
        ? new WebSpeechEngine()
        : new CoreSpeechEngine(segment.voice.profileId, {
            synthesize: (input, context) =>
              api.synthesizeTtsRequest(context!.requestId, {
                ...input,
                instructions: segment.instructions,
              }),
          }),
    private readonly prefetch = false,
  ) {}

  async initialize() {
    await this.base.initialize?.()
  }
  loadUtterances(contents: ReadiumSpeechUtterance[]) {
    this.ahead.clear()
    this.cancel()
    this.utterances = [...contents]
    this.index = 0
    this.state = "ready"
    this.emit({ type: "ready" })
  }
  setVoice(voice: ReadiumSpeechVoice | string) {
    this.ahead.clear()
    this.base.setVoice(voice)
  }
  getCurrentVoice() {
    return this.base.getCurrentVoice()
  }
  getAvailableVoices() {
    return this.base.getAvailableVoices()
  }
  setSpeakInContentLanguage(value: boolean) {
    this.base.setSpeakInContentLanguage(value)
  }
  getSpeakInContentLanguage() {
    return this.base.getSpeakInContentLanguage()
  }
  setRate(value: number) {
    this.base.setRate(value)
    this.active?.setRate(value)
  }
  getRate() {
    return this.base.getRate()
  }
  setPitch(value: number) {
    this.base.setPitch(value)
    this.active?.setPitch(value)
  }
  getPitch() {
    return this.base.getPitch()
  }
  setVolume(value: number) {
    this.base.setVolume(value)
    this.active?.setVolume(value)
  }
  getVolume() {
    return this.base.getVolume()
  }
  getState() {
    return this.state
  }
  getCurrentUtteranceIndex() {
    return this.index
  }
  getUtteranceCount() {
    return this.utterances.length
  }
  setCurrentUtteranceIndex(
    index: number,
    complete?: (success: boolean) => void,
  ) {
    if (index < 0 || index >= this.utterances.length) {
      complete?.(false)
      return
    }
    if (this.index !== index) {
      this.cancel()
      this.ahead.clear()
    }
    this.index = index
    complete?.(true)
  }
  speak(index = this.index) {
    if (index !== this.index) this.ahead.clear()
    this.cancel()
    this.paused = false
    this.index = index
    const utterance = this.utterances[index]
    if (!utterance) {
      this.state = "idle"
      this.emit({ type: "end" })
      return
    }
    const controller = new AbortController()
    this.controller = controller
    const generation = this.generation
    this.state = "loading"
    this.emit({ type: "loading" })
    void this.play(utterance, generation, controller.signal).catch((error) => {
      if (generation !== this.generation || controller.signal.aborted) return
      this.state = "idle"
      this.emit({ type: "error", detail: { error, message: String(error) } })
    })
  }
  private isCurrent(generation: number, signal: AbortSignal) {
    return generation === this.generation && !signal.aborted
  }
  private async play(
    utterance: ReadiumSpeechUtterance,
    generation: number,
    signal: AbortSignal,
  ) {
    const voice =
      this.base.getCurrentVoice() ?? (await this.base.getAvailableVoices())[0]
    const voiceId =
      voice?.identifier ??
      voice?.voiceURI ??
      voice?.originalName ??
      voice?.name ??
      ""
    const defaultVoice: TtsVoiceRefDto = this.profileId
      ? { engine: "provider", profileId: this.profileId, voiceId }
      : { engine: "system", voiceId }
    const segments = await this.prepare(utterance, defaultVoice, signal)
    if (!this.isCurrent(generation, signal)) return
    this.prefetchAhead(defaultVoice)
    for (const segment of segments) {
      if (!this.isCurrent(generation, signal)) return
      const engine = this.createEngine(segment)
      this.active = engine
      try {
        await engine.initialize?.()
        if (!this.isCurrent(generation, signal)) {
          await engine.destroy()
          return
        }
        engine.setRate(this.getRate())
        engine.setPitch(this.getPitch())
        engine.setVolume(this.getVolume())
        engine.setSpeakInContentLanguage(false)
        await selectVoice(engine, segment.voice)
        if (!this.isCurrent(generation, signal)) return
        engine.loadUtterances([
          {
            id: utterance.id,
            language: utterance.language,
            plain: segment.text,
          },
        ])
        await new Promise<void>((resolve, reject) => {
          const unsubscribers: (() => void)[] = []
          const cleanup = () => {
            unsubscribers.forEach((unsubscribe) => unsubscribe())
            signal.removeEventListener("abort", abort)
          }
          const abort = () => {
            cleanup()
            engine.stop()
            resolve()
          }
          unsubscribers.push(
            engine.on("end", () => {
              cleanup()
              resolve()
            }),
            engine.on("error", (event) => {
              cleanup()
              reject(
                event.detail?.error ??
                  new Error(event.detail?.message ?? "TTS_FAILED"),
              )
            }),
          )
          for (const type of ["start", "pause", "resume"] as const)
            unsubscribers.push(
              engine.on(type, (event) => {
                if (generation !== this.generation) return
                if (type !== "pause" && this.paused) {
                  engine.pause()
                  return
                }
                this.state = type === "pause" ? "paused" : "playing"
                this.emit(event)
              }),
            )
          signal.addEventListener("abort", abort, { once: true })
          if (signal.aborted) abort()
          else engine.speak(0)
        })
      } finally {
        await engine.destroy()
        if (this.active === engine) this.active = null
      }
    }
    if (this.isCurrent(generation, signal)) {
      this.state = "ready"
      this.emit({ type: "end" })
    }
  }
  private prefetchAhead(defaultVoice: TtsVoiceRefDto) {
    if (this.prefetch)
      this.ahead.set(
        this.utterances
          .slice(this.index + 1, this.index + 3)
          .map((next, offset) => ({
            key: next.id ?? String(this.index + offset + 1),
            run: async (signal) => {
              const jobs = await this.prepare(next, defaultVoice, signal)
              for (const job of jobs) {
                if (signal.aborted) return
                if (job.voice.engine !== "provider") continue
                const requestId = crypto.randomUUID()
                const cancel = () => {
                  void api.cancelTtsSynthesis(requestId)
                }
                signal.addEventListener("abort", cancel, { once: true })
                try {
                  await api.synthesizeTtsRequest(requestId, {
                    profileId: job.voice.profileId,
                    voiceId: job.voice.voiceId,
                    text: job.text,
                    language: next.language,
                    instructions: job.instructions,
                    acceptedMimeTypes: ACCEPTED_MIME_TYPES,
                    cachePolicy: "use",
                  })
                } finally {
                  signal.removeEventListener("abort", cancel)
                }
              }
            },
          })),
      )
  }
  pause() {
    this.paused = true
    this.active?.pause()
    if (this.state !== "paused") {
      this.state = "paused"
      this.emit({ type: "pause" })
    }
  }
  resume() {
    this.paused = false
    if (this.active) this.active.resume()
    else if (!this.controller) this.speak(this.index)
    else {
      this.state = "loading"
      this.emit({ type: "loading" })
    }
  }
  stop() {
    this.ahead.clear()
    this.cancel()
    this.state = "idle"
    this.emit({ type: "stop" })
  }
  private cancel() {
    this.generation++
    this.controller?.abort()
    this.controller = null
    const active = this.active
    this.active = null
    if (active) void active.destroy()
  }
  on(
    type: ReadiumSpeechPlaybackEvent["type"],
    callback: (event: ReadiumSpeechPlaybackEvent) => void,
  ) {
    const listeners = this.listeners.get(type) ?? new Set()
    listeners.add(callback)
    this.listeners.set(type, listeners)
    return () => {
      listeners.delete(callback)
    }
  }
  private emit(event: ReadiumSpeechPlaybackEvent) {
    this.listeners.get(event.type)?.forEach((listener) => listener(event))
  }
  async destroy() {
    this.ahead.clear()
    this.cancel()
    this.listeners.clear()
    await this.base.destroy()
  }
}
