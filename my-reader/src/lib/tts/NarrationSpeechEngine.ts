import {
  WebSpeechEngine,
  type ReadiumSpeechPlaybackEngine,
  type ReadiumSpeechPlaybackEvent,
  type ReadiumSpeechPlaybackState,
  type ReadiumSpeechUtterance,
  type ReadiumSpeechVoice,
} from "@readium/speech"
import { CoreSpeechEngine, ACCEPTED_MIME_TYPES } from "./CoreSpeechEngine"
import { runTtsRequest } from "@my-reader/tools/tts-request"
import { TtsBuffer } from "@my-reader/tools/tts-buffer"
import { api } from "@/lib/tauri-api"
import type {
  NarrationSpeechDto,
  TtsVoiceRefDto,
  TtsAudioArtifactDto,
} from "@/lib/tauri-specta"

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
  private buffer: TtsBuffer<NarrationSpeechDto, TtsAudioArtifactDto> | null =
    null

  constructor(
    private readonly base: ReadiumSpeechPlaybackEngine,
    private readonly profileId: string | undefined,
    private readonly prepare: Prepare,
    private readonly createEngine = (
      segment: NarrationSpeechDto,
      artifact?: TtsAudioArtifactDto,
    ): ReadiumSpeechPlaybackEngine =>
      segment.voice.engine === "system"
        ? new WebSpeechEngine()
        : new CoreSpeechEngine(segment.voice.profileId, {
            preparedArtifact: artifact,
            synthesize: (input, context) =>
              api.synthesizeTtsRequest(context!.requestId, {
                ...input,
                instructions: segment.instructions,
              }),
          }),
    private readonly prefetch = false,
    private readonly synthesize = async (
      segment: NarrationSpeechDto,
      text: string,
      language: string | undefined,
      signal: AbortSignal,
    ): Promise<TtsAudioArtifactDto> => {
      if (segment.voice.engine !== "provider")
        throw new Error("TTS_PROFILE_NOT_FOUND")
      const requestId = crypto.randomUUID()
      const cancel = () => {
        void api.cancelTtsSynthesis(requestId).catch(() => undefined)
      }
      signal.addEventListener("abort", cancel, { once: true })
      try {
        return await api.synthesizeTtsRequest(requestId, {
          profileId: segment.voice.profileId,
          voiceId: segment.voice.voiceId,
          text,
          language,
          instructions: segment.instructions,
          acceptedMimeTypes: ACCEPTED_MIME_TYPES,
          cachePolicy: "use",
        })
      } finally {
        signal.removeEventListener("abort", cancel)
      }
    },
    private readonly configurationKey = (profileId: string) => profileId,
  ) {}

  async initialize() {
    await this.base.initialize?.()
  }
  loadUtterances(contents: ReadiumSpeechUtterance[]) {
    this.clearBuffer()
    this.cancel()
    this.utterances = [...contents]
    this.index = 0
    this.state = "ready"
    this.emit({ type: "ready" })
  }
  setVoice(voice: ReadiumSpeechVoice | string) {
    this.clearBuffer()
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
    const previous = this.getRate()
    this.base.setRate(value)
    this.active?.setRate(value)
    this.buffer?.changeRate(previous, this.getRate())
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
      if (!(this.state === "ready" && index === this.index + 1))
        this.clearBuffer()
      this.cancel()
    }
    this.index = index
    complete?.(true)
  }
  speak(index = this.index) {
    if (
      index !== this.index &&
      !(this.state === "ready" && index === this.index + 1)
    )
      this.clearBuffer()
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
      this.clearBuffer()
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
    this.buffer ??= new TtsBuffer({
      count: this.prefetch ? this.utterances.length : this.index + 1,
      rate: () => this.getRate(),
      load: async (index, signal) =>
        (await this.prepare(this.utterances[index], defaultVoice, signal)).map(
          (segment) => ({
            text: segment.text,
            startUtf16: segment.startUtf16,
            context: segment,
            key: JSON.stringify([
              segment.voice,
              segment.voice.engine === "provider"
                ? this.configurationKey(segment.voice.profileId)
                : "system",
              segment.instructions,
              this.utterances[index].language,
            ]),
            system: segment.voice.engine === "system",
            language: this.utterances[index].language,
          }),
        ),
      synthesize: (run, text, signal) =>
        runTtsRequest(
          (requestSignal) =>
            this.synthesize(run.context, text, run.language, requestSignal),
          signal,
        ),
    })
    const buffer = this.buffer
    buffer.activate(this.index)
    for (let index = 0; ; index++) {
      const chunk = await buffer.read(this.index, index)
      if (!this.isCurrent(generation, signal)) return
      if (!chunk) break
      const segment = {
        ...chunk.context,
        text: chunk.text,
        startUtf16: chunk.startUtf16,
        endUtf16: chunk.endUtf16,
      }
      const engine = this.createEngine(segment, chunk.audio)
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
                if (type === "start") buffer.startedChunk(index)
                else buffer.setPlaying(type !== "pause")
                this.state = type === "pause" ? "paused" : "playing"
                this.emit(event)
              }),
            )
          signal.addEventListener("abort", abort, { once: true })
          if (signal.aborted) abort()
          else engine.speak(0)
        })
      } finally {
        buffer.setPlaying(false)
        await engine.destroy()
        if (this.active === engine) this.active = null
      }
    }
    if (this.isCurrent(generation, signal)) {
      buffer.setPlaying(false)
      this.state = "ready"
      this.emit({ type: "end" })
    }
  }
  private clearBuffer() {
    this.buffer?.dispose()
    this.buffer = null
  }
  pause() {
    this.paused = true
    this.buffer?.setPlaying(false)
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
    this.clearBuffer()
    this.cancel()
    this.state = "idle"
    this.emit({ type: "stop" })
  }
  private cancel() {
    this.buffer?.setPlaying(false)
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
    this.clearBuffer()
    this.cancel()
    this.listeners.clear()
    await this.base.destroy()
  }
}
