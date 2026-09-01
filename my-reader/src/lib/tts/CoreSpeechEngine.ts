import { ttsLanguageMatches } from "@my-reader/tools/reader-tts-language"
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

const ACCEPTED_MIME_TYPES = [
  "audio/mpeg",
  "audio/ogg",
  "audio/aac",
  "audio/flac",
  "audio/wav",
  "audio/x-wav",
]
const LOOKAHEAD_UTTERANCE_COUNT = 3

type SynthesisEntry = {
  requestId: string
  revision: number
  controller: AbortController
  dispatched: boolean
  settled: boolean
  promise: Promise<TtsAudioArtifactDto>
}

function voiceIdentifier(voice: ReadiumSpeechVoice): string {
  return voice.identifier ?? voice.voiceURI ?? voice.originalName ?? voice.name
}

function toReadiumVoice(voice: TtsVoiceDto): ReadiumSpeechVoice {
  return {
    source: "server",
    label: voice.name,
    name: voice.name,
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
  private generation = 0
  private synthesisRevision = 0
  private synthesisSequence = 0
  private readonly synthesisRequestPrefix =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2)}`
  private synthesisEntries = new Map<number, SynthesisEntry>()
  private rate = 1
  private pitch = 1
  private volume = 1
  private speakInContentLanguage = true

  constructor(
    private readonly profileId: string,
    dependencies: CoreSpeechEngineDependencies = {},
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
    this.setState("ready")
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
    this.voicesPromise ??= this.listVoices(this.profileId)
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
    this.currentIndex = nextIndex
    const generation = this.generation
    const synthesisRevision = this.synthesisRevision
    this.setState("loading")
    void this.synthesizeAndPlay(generation, synthesisRevision)
  }

  private async synthesizeAndPlay(
    generation: number,
    synthesisRevision: number,
  ): Promise<void> {
    try {
      const artifact = await this.scheduleLookahead(
        this.currentIndex,
        synthesisRevision,
      )
      if (
        generation !== this.generation ||
        synthesisRevision !== this.synthesisRevision
      )
        return

      const audio = this.createAudio()
      this.audio = audio
      audio.src = this.audioSource(artifact.path)
      audio.playbackRate = Math.max(0.25, Math.min(4, this.rate))
      audio.volume = this.volume

      const onEnded = () => {
        if (generation !== this.generation) return
        this.audioCleanup?.()
        this.audioCleanup = null
        this.audio = null
        this.setState("ready")
        this.emit({ type: "end" })
      }
      const onError = () => {
        if (generation !== this.generation) return
        this.audioCleanup?.()
        this.audioCleanup = null
        this.audio = null
        this.fail(new Error("TTS_AUDIO_PLAYBACK_FAILED"))
      }
      audio.addEventListener("ended", onEnded)
      audio.addEventListener("error", onError)
      this.audioCleanup = () => this.detachAudio(audio, onEnded, onError)
      await audio.play()
      if (generation !== this.generation) {
        audio.pause()
        this.audioCleanup?.()
        this.audioCleanup = null
        return
      }
      this.setState("playing")
      this.emit({ type: "start" })
    } catch (error: unknown) {
      if (generation !== this.generation) return
      this.fail(error)
    }
  }

  pause(): void {
    if (this.state !== "playing" || !this.audio) return
    this.audio.pause()
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
    void this.audio
      .play()
      .then(() => {
        if (generation !== this.generation) return
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
    this.rate = Math.max(0.25, Math.min(4, rate))
    if (this.audio) this.audio.playbackRate = this.rate
    this.pruneSynthesisQueue(new Set([this.currentIndex]))
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
    if (index !== this.currentIndex) this.cancelAudio()
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
    this.generation += 1
    this.audioCleanup?.()
    this.audioCleanup = null
    if (!this.audio) return
    this.audio.pause()
    this.audio.currentTime = 0
    this.audio = null
  }

  private scheduleLookahead(
    startIndex: number,
    revision: number,
  ): Promise<TtsAudioArtifactDto> {
    const indices = Array.from(
      { length: LOOKAHEAD_UTTERANCE_COUNT },
      (_, offset) => startIndex + offset,
    ).filter((index) => index < this.utterances.length)
    this.pruneSynthesisQueue(new Set(indices))
    const requests = indices.map((index) =>
      this.ensureSynthesis(index, revision),
    )
    requests.slice(1).forEach((request) => {
      void request.catch(() => undefined)
    })
    const current = requests[0]
    if (!current) return Promise.reject(new Error("TTS_UTTERANCE_UNAVAILABLE"))
    return current
  }

  private ensureSynthesis(
    index: number,
    revision: number,
  ): Promise<TtsAudioArtifactDto> {
    const existing = this.synthesisEntries.get(index)
    if (existing?.revision === revision) return existing.promise
    if (existing) this.cancelSynthesisEntry(existing)

    const controller = new AbortController()
    const requestId = `${this.profileId}-${this.synthesisRequestPrefix}-${++this.synthesisSequence}`
    const entry: SynthesisEntry = {
      requestId,
      revision,
      controller,
      dispatched: false,
      settled: false,
      promise: Promise.resolve(null as unknown as TtsAudioArtifactDto),
    }
    entry.promise = this.synthesizeUtterance(
      index,
      requestId,
      controller.signal,
      () => {
        entry.dispatched = true
      },
    )
      .catch((error: unknown) => {
        if (this.synthesisEntries.get(index) === entry) {
          this.synthesisEntries.delete(index)
        }
        throw error
      })
      .finally(() => {
        entry.settled = true
      })
    this.synthesisEntries.set(index, entry)
    return entry.promise
  }

  private async synthesizeUtterance(
    index: number,
    requestId: string,
    signal: AbortSignal,
    onDispatch: () => void,
  ): Promise<TtsAudioArtifactDto> {
    const utterance = this.utterances[index]
    if (!utterance) throw new Error("TTS_UTTERANCE_UNAVAILABLE")
    const voices = await this.getAvailableVoices()
    if (signal.aborted) throw new DOMException("Aborted", "AbortError")
    const voice = this.voiceForUtterance(utterance, voices)
    if (!voice) throw new Error("TTS_VOICE_UNAVAILABLE")
    onDispatch()
    return this.synthesize(
      {
        profileId: this.profileId,
        text: utterance.plain ?? "",
        language: utterance.language,
        voiceId: voiceIdentifier(voice),
        acceptedMimeTypes: ACCEPTED_MIME_TYPES,
        cachePolicy: "use",
      },
      { requestId, signal },
    )
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

  private pruneSynthesisQueue(keep: Set<number>): void {
    this.synthesisEntries.forEach((entry, index) => {
      if (keep.has(index)) return
      this.cancelSynthesisEntry(entry)
      this.synthesisEntries.delete(index)
    })
  }

  private resetSynthesisQueue(): void {
    this.synthesisRevision += 1
    this.pruneSynthesisQueue(new Set())
  }

  private cancelSynthesisEntry(entry: SynthesisEntry): void {
    if (entry.controller.signal.aborted) return
    entry.controller.abort()
    if (entry.dispatched && !entry.settled) {
      void this.cancelSynthesis(entry.requestId).catch(() => undefined)
    }
  }

  private detachAudio(
    audio: TtsAudio,
    onEnded: () => void,
    onError: () => void,
  ): void {
    audio.removeEventListener("ended", onEnded)
    audio.removeEventListener("error", onError)
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
