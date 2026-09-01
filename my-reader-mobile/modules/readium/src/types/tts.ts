import type { Locator } from "./locator"
import type { Utterance } from "./publication-handle"

export type TtsEngineKind = "system" | "provider"

export type TtsEngineConfig = {
  kind: TtsEngineKind
  profileId?: string
  voiceId?: string
  language?: string
  speed: number
  pitch: number
  highlightColor?: string
}

export type TtsPlaybackStatus =
  | "stopped"
  | "loading"
  | "playing"
  | "paused"
  | "ended"
  | "error"

export type TtsPlaybackState = {
  state: TtsPlaybackStatus
  utterance?: string
  locator?: Locator
  error?: string
  canGoPrevious?: boolean
  canGoNext?: boolean
}

export type TtsSynthesisRequestEvent = {
  requestId: string
  text: string
  language?: string
  profileId: string
  voiceId: string
  speed: number
  pitch: number
}

export type TtsSynthesisCancelEvent = {
  requestIds: string[]
}

export type TtsTiming = {
  startUtf16: number
  endUtf16: number
  startMs: number
  endMs: number
}

export type TtsSynthesisCompletion = {
  requestId: string
  path?: string
  mimeType?: string
  timings?: TtsTiming[]
  error?: string
}

export type TtsVoice = {
  id: string
  name: string
  language: string
  gender?: string
}

/** Re-exported for publication-content consumers. */
export type { Utterance }
