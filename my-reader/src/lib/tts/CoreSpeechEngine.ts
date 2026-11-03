import { ttsLanguageMatches } from "@my-reader/tools/reader-tts-language"
import { TtsBuffer } from "@my-reader/tools/tts-buffer"
import { runTtsRequest } from "@my-reader/tools/tts-request"
import type {
  ReadiumSpeechPlaybackEngine,
  ReadiumSpeechPlaybackEvent,
  ReadiumSpeechPlaybackState,
  ReadiumSpeechUtterance,
  ReadiumSpeechVoice,
} from "@readium/speech"
import { convertFileSrc, isTauri } from "@tauri-apps/api/core"
import { api } from "@/lib/tauri-api"
import type { TtsAudioArtifactDto, TtsVoiceDto } from "@/lib/tauri-specta"

type AudioEvent = "ended" | "error"

export type TtsAudio = {
  src: string
  currentTime: number
  playbackRate: number
  volume: number
  play: () => Promise<void>
  pause: () => void
  addEventListener: (event: AudioEvent, listener: () => void) => void
  removeEventListener: (event: AudioEvent, listener: () => void) => void
}

export type CoreSpeechEngineDependencies = {
  preparedArtifact?: TtsAudioArtifactDto
  maxInputChars?: number
  performanceKey?: string
  synthesize?: (
    input: {
      profileId: string
      text: string
      language?: string | null
      voiceId: string
      acceptedMimeTypes?: string[]
      cachePolicy?: "use" | "refresh" | "bypass"
    },
    context?: {
      requestId: string
      signal: AbortSignal
    },
  ) => Promise<TtsAudioArtifactDto>
  cancelSynthesis?: (requestId: string) => Promise<boolean>
  listVoices?: (profileId: string) => Promise<TtsVoiceDto[]>
  createAudio?: () => TtsAudio
  audioSource?: (path: string) => string
}

const LOCAL_OPERATION_TIMEOUT_MS = 20_000

export const ACCEPTED_MIME_TYPES = [
  "audio/mpeg",
  "audio/ogg",
  "audio/aac",
  "audio/flac",
  "audio/wav",
  "audio/x-wav",
]
function voiceIdentifier(voice: ReadiumSpeechVoice): string {
  return voice.identifier ?? voice.voiceURI ?? voice.originalName ?? voice.name
}

function toReadiumVoice(voice: TtsVoiceDto): ReadiumSpeechVoice {
  return {
    source: "server",
    label: voice.id,
    name: voice.id,
    originalName: voice.id,
    voiceURI: voice.id,
    language: voice.language,
    identifier: voice.id,
    gender:
      voice.gender === "female" ||
      voice.gender === "male" ||
      voice.gender === "neutral"
        ? voice.gender
        : undefined,
    provider: "myreader-core",
    controls: {},
  }
}

export class CoreSpeechEngine implements ReadiumSpeechPlaybackEngine {
  private readonly eventListeners = new Map<
    ReadiumSpeechPlaybackEvent["type"],
    Set<(event: ReadiumSpeechPlaybackEvent) => void>
  >()
  private readonly synthesize: NonNullable<
    CoreSpeechEngineDependencies["synthesize"]
  >
  private readonly listVoices: NonNullable<
    CoreSpeechEngineDependencies["listVoices"]
  >
  private readonly cancelSynthesis: NonNullable<
    CoreSpeechEngineDependencies["cancelSynthesis"]
  >
  private readonly createAudio: NonNullable<
    CoreSpeechEngineDependencies["createAudio"]
  >
  private readonly audioSource: NonNullable<
    CoreSpeechEngineDependencies["audioSource"]
  >
  private utterances: ReadiumSpeechUtterance[] = []
  private voices: ReadiumSpeechVoice[] | null = null
  private voicesPromise: Promise<ReadiumSpeechVoice[]> | null = null
  private currentVoice: ReadiumSpeechVoice | null = null
  private currentIndex = 0
  private state: ReadiumSpeechPlaybackState = "idle"
  private audio: TtsAudio | null = null
  private audioCleanup: (() => void) | null = null
  private playbackController: AbortController | null = null
  private generation = 0
  private synthesisSequence = 0
  private readonly synthesisRequestPrefix =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2)}`
  private buffer: TtsBuffer<
    ReadiumSpeechUtterance & { voiceId: string },
    TtsAudioArtifactDto
  > | null = null
  private rate = 1
  private pitch = 1
  private volume = 1
  private speakInContentLanguage = true

  constructor(
    private readonly profileId: string,
    private readonly dependencies: CoreSpeechEngineDependencies = {},
  ) {
    this.synthesize =
      dependencies.synthesize ??
      ((input, context) => {
        if (!context) throw new Error("TTS_SYNTHESIS_CONTEXT_REQUIRED")
        return api.synthesizeTtsRequest(context.requestId, input)
      })
    this.cancelSynthesis =
      dependencies.cancelSynthesis ?? api.cancelTtsSynthesis
    this.listVoices = dependencies.listVoices ?? api.listTtsVoices
    this.createAudio =
      dependencies.createAudio ?? (() => new Audio() as unknown as TtsAudio)
    this.audioSource =
      dependencies.audioSource ??
      ((path) => (isTauri() ? convertFileSrc(path) : path))
  }

  async initialize(): Promise<void> {
    await this.getAvailableVoices()
  }

  loadUtterances(contents: ReadiumSpeechUtterance[]): void {
    this.cancelAudio()
    this.resetSynthesisQueue()
    this.utterances = [...contents]
    this.currentIndex = 0
    // Readium waits for a ready event on every content load, even when the
    // previous queue was already ready and never started playing.
    this.state = "ready"
    this.emit({ type: "ready" })
  }

  setVoice(voice: ReadiumSpeechVoice | string): void {
    const previous = this.currentVoice
    const previousId = previous ? voiceIdentifier(previous) : null
    if (typeof voice === "string") {
      this.currentVoice =
        this.voices?.find(
          (candidate) => voiceIdentifier(candidate) === voice,
        ) ?? null
    } else {
      this.currentVoice = voice
    }
    const nextId = this.currentVoice ? voiceIdentifier(this.currentVoice) : null
    if (previousId !== nextId) {
      this.resetSynthesisQueue()
    }
  }

  getCurrentVoice(): ReadiumSpeechVoice | null {
    return this.currentVoice
  }

  async getAvailableVoices(): Promise<ReadiumSpeechVoice[]> {
    if (this.voices) return [...this.voices]
    this.voicesPromise ??= runTtsRequest(
      () => this.listVoices(this.profileId),
      undefined,
      LOCAL_OPERATION_TIMEOUT_MS,
    )
      .then((voices) => {
        this.voices = voices.map(toReadiumVoice)
        this.currentVoice ??= this.voices[0] ?? null
        this.emit({ type: "voiceschanged" })
        return this.voices
      })
      .finally(() => {
        this.voicesPromise = null
      })
    return [...(await this.voicesPromise)]
  }

  setSpeakInContentLanguage(enabled: boolean): void {
    this.speakInContentLanguage = enabled
  }

  getSpeakInContentLanguage(): boolean {
    return this.speakInContentLanguage
  }

  speak(utteranceIndex?: number): void {
    const nextIndex = utteranceIndex ?? this.currentIndex
    if (nextIndex < 0 || nextIndex >= this.utterances.length) {
      this.setState("idle")
      this.emit({ type: "end" })
      return
    }

    this.cancelAudio()
    this.playbackController = new AbortController()
    if (
      nextIndex !== this.currentIndex &&
      !(this.state === "ready" && nextIndex === this.currentIndex + 1)
    )
      this.resetSynthesisQueue()
    this.currentIndex = nextIndex
    const generation = this.generation
    this.setState("loading")
    void this.synthesizeAndPlay(generation).catch((error: unknown) => {
      if (generation === this.generation) this.fail(error)
    })
  }

  private async synthesizeAndPlay(generation: number): Promise<void> {
    this.buffer ??= new TtsBuffer({
      count: this.utterances.length,
      rate: () => this.rate,
      split: !this.dependencies.preparedArtifact,
      load: async (index, signal) => {
        const utterance = this.utterances[index]
        const voices = await this.getAvailableVoices()
        if (signal.aborted) throw new DOMException("Aborted", "AbortError")
        const voice = this.voiceForUtterance(utterance, voices)
        if (!voice) throw new Error("TTS_VOICE_UNAVAILABLE")
        const voiceId = voiceIdentifier(voice)
        return [
          {
            text: utterance.plain ?? "",
            startUtf16: 0,
            context: { ...utterance, voiceId },
            key: JSON.stringify([
              this.dependencies.performanceKey ?? this.profileId,
              voiceId,
              utterance.language,
            ]),
            language: utterance.language,
            maxChars: this.dependencies.maxInputChars,
          },
        ]
      },
      synthesize: async (run, text, signal) => {
        if (this.dependencies.preparedArtifact)
          return { ...this.dependencies.preparedArtifact, synthesisMs: null }
        const requestId = `${this.profileId}-${this.synthesisRequestPrefix}-${++this.synthesisSequence}`
        const cancel = () => {
          void this.cancelSynthesis(requestId).catch(() => undefined)
        }
        return runTtsRequest(async (requestSignal) => {
          requestSignal.addEventListener("abort", cancel, { once: true })
          try {
            return await this.synthesize(
              {
                profileId: this.profileId,
                voiceId: run.context.voiceId,
                text,
                language: run.language,
                acceptedMimeTypes: ACCEPTED_MIME_TYPES,
                cachePolicy: "use",
              },
              { requestId, signal: requestSignal },
            )
          } finally {
            requestSignal.removeEventListener("abort", cancel)
          }
        }, signal)
      },
    })
    const buffer = this.buffer
    buffer.activate(this.currentIndex)
    for (let index = 0; ; index++) {
      const chunk = await buffer.read(this.currentIndex, index)
      if (generation !== this.generation || !chunk) break
      await this.playArtifact(chunk.audio!, generation, () =>
        buffer.startedChunk(index),
      )
      buffer.setPlaying(false)
      if (generation !== this.generation) return
    }
    if (generation === this.generation) {
      buffer.setPlaying(false)
      this.setState("ready")
      this.emit({ type: "end" })
    }
  }

  private async playArtifact(
    artifact: TtsAudioArtifactDto,
    generation: number,
    started: () => void,
  ) {
    const audio = this.createAudio()
    this.audio = audio
    audio.src = this.audioSource(artifact.path)
    audio.playbackRate = Math.max(0.25, Math.min(4, this.rate))
    audio.volume = this.volume
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        audio.removeEventListener("ended", onEnded)
        audio.removeEventListener("error", onError)
        if (this.audio === audio) {
          this.audio = null
          this.audioCleanup = null
        }
      }
      const onEnded = () => {
        cleanup()
        resolve()
      }
      const onError = () => {
        cleanup()
        reject(new Error("TTS_AUDIO_PLAYBACK_FAILED"))
      }
      audio.addEventListener("ended", onEnded)
      audio.addEventListener("error", onError)
      this.audioCleanup = () => {
        cleanup()
        resolve()
      }
      void runTtsRequest(
        () => audio.play(),
        this.playbackController?.signal,
        LOCAL_OPERATION_TIMEOUT_MS,
      ).then(
        () => {
          if (generation !== this.generation) {
            audio.pause()
            cleanup()
            resolve()
            return
          }
          started()
          this.setState("playing")
          this.emit({ type: "start" })
        },
        (error) => {
          audio.pause()
          cleanup()
          reject(error)
        },
      )
    })
  }

  pause(): void {
    if (this.state !== "playing" || !this.audio) return
    this.audio.pause()
    this.buffer?.setPlaying(false)
    this.setState("paused")
    this.emit({ type: "pause" })
  }

  resume(): void {
    if (this.state !== "paused") return
    if (!this.audio) {
      this.speak(this.currentIndex)
      return
    }
    const generation = this.generation
    void runTtsRequest(
      () => this.audio!.play(),
      this.playbackController?.signal,
      LOCAL_OPERATION_TIMEOUT_MS,
    )
      .then(() => {
        if (generation !== this.generation) return
        this.buffer?.setPlaying(true)
        this.setState("playing")
        this.emit({ type: "resume" })
      })
      .catch((error: unknown) => {
        if (generation === this.generation) this.fail(error)
      })
  }

  stop(): void {
    this.cancelAudio()
    this.resetSynthesisQueue()
    this.currentIndex = 0
    this.setState("idle")
    this.emit({ type: "stop" })
  }

  setRate(rate: number): void {
    const previous = this.rate
    this.rate = Math.max(0.25, Math.min(4, rate))
    if (this.audio) this.audio.playbackRate = this.rate
    this.buffer?.changeRate(previous, this.rate)
  }

  getRate(): number {
    return this.rate
  }

  setPitch(pitch: number): void {
    this.pitch = Math.max(0, Math.min(2, pitch))
  }

  getPitch(): number {
    return this.pitch
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume))
    if (this.audio) this.audio.volume = this.volume
  }

  getVolume(): number {
    return this.volume
  }

  getState(): ReadiumSpeechPlaybackState {
    return this.state
  }

  getCurrentUtteranceIndex(): number {
    return this.currentIndex
  }

  setCurrentUtteranceIndex(
    index: number,
    onComplete?: (success: boolean) => void,
  ): void {
    if (index < 0 || index >= this.utterances.length) {
      onComplete?.(false)
      return
    }
    if (index !== this.currentIndex) {
      if (!(this.state === "ready" && index === this.currentIndex + 1))
        this.resetSynthesisQueue()
      this.cancelAudio()
    }
    this.currentIndex = index
    onComplete?.(true)
  }

  getUtteranceCount(): number {
    return this.utterances.length
  }

  on(
    event: ReadiumSpeechPlaybackEvent["type"],
    callback: (event: ReadiumSpeechPlaybackEvent) => void,
  ): () => void {
    const listeners = this.eventListeners.get(event) ?? new Set()
    listeners.add(callback)
    this.eventListeners.set(event, listeners)
    return () => {
      listeners.delete(callback)
    }
  }

  async destroy(): Promise<void> {
    this.cancelAudio()
    this.resetSynthesisQueue()
    this.eventListeners.clear()
    this.utterances = []
    this.voices = null
    this.voicesPromise = null
    this.currentVoice = null
    this.state = "idle"
  }

  private cancelAudio(): void {
    this.buffer?.setPlaying(false)
    this.generation += 1
    this.playbackController?.abort()
    this.playbackController = null
    const audio = this.audio
    this.audioCleanup?.()
    this.audioCleanup = null
    if (!audio) return
    audio.pause()
    audio.currentTime = 0
    this.audio = null
  }

  private voiceForUtterance(
    utterance: ReadiumSpeechUtterance,
    voices: ReadiumSpeechVoice[],
  ): ReadiumSpeechVoice | undefined {
    const selectedVoice = this.currentVoice
    const selectedVoiceMatches =
      selectedVoice &&
      ttsLanguageMatches(selectedVoice.language, utterance.language)
    const languageVoice =
      this.speakInContentLanguage && !selectedVoiceMatches
        ? voices.find((voice) =>
            ttsLanguageMatches(voice.language, utterance.language),
          )
        : undefined
    return (
      (selectedVoiceMatches ? selectedVoice : undefined) ??
      languageVoice ??
      selectedVoice ??
      voices[0]
    )
  }

  private resetSynthesisQueue(): void {
    this.buffer?.dispose()
    this.buffer = null
  }

  private setState(state: ReadiumSpeechPlaybackState): void {
    if (this.state === state) return
    this.state = state
    if (state === "loading" || state === "ready" || state === "idle") {
      this.emit({ type: state })
    }
  }

  private fail(error: unknown): void {
    this.cancelAudio()
    this.resetSynthesisQueue()
    this.setState("idle")
    this.emit({
      type: "error",
      detail: {
        error,
        message: error instanceof Error ? error.message : String(error),
      },
    })
  }

  private emit(event: ReadiumSpeechPlaybackEvent): void {
    this.eventListeners.get(event.type)?.forEach((listener) => {
      listener(event)
    })
  }
}
