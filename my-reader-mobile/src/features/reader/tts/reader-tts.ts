import type { TtsEngineConfig } from "@my-reader/readium"
import {
  chooseTtsVoiceForLanguage,
  filterTtsVoicesForLanguage,
  normalizeTtsLanguage,
} from "@my-reader/tools/reader-tts-language"

import type {
  MobileTtsConfig,
  MobileTtsProviderProfile,
  TtsLanguageVoice,
  TtsSynthesisRequest,
  TtsVoice,
} from "@/src/services/core/tts"

export type ReaderTtsSelection =
  | {
      kind: "system"
      voiceId?: string
    }
  | {
      kind: "provider"
      profile: MobileTtsProviderProfile
      voiceId?: string
    }

export type ReaderTtsErrorPresentation =
  | { kind: "noReadableContent" }
  | { kind: "noVoices" }
  | { kind: "unknown" }
  | { kind: "providerUnavailable" }
  | { kind: "engine"; message: string }

export function classifyReaderTtsError(
  error: string,
): ReaderTtsErrorPresentation {
  if (error === "TTS_NO_READABLE_CONTENT_FROM_POSITION") {
    return { kind: "noReadableContent" }
  }
  if (error === "TTS_VOICES_EMPTY") return { kind: "noVoices" }
  if (
    error === "TTS_UNKNOWN_ERROR" ||
    error === "TTS_READER_VIEW_UNAVAILABLE"
  ) {
    return { kind: "unknown" }
  }
  if (
    error.includes("TTS_PROVIDER_UNAVAILABLE") ||
    error.includes("TTS_NETWORK_ERROR") ||
    error.includes("TTS_REQUEST_TIMEOUT")
  ) {
    return { kind: "providerUnavailable" }
  }
  return { kind: "engine", message: error }
}

function normalizedLanguage(language: string | undefined): string {
  return normalizeTtsLanguage(language) || "und"
}

function matchingVoice(
  voices: TtsLanguageVoice[],
  language: string,
  predicate: (voice: TtsLanguageVoice) => boolean,
): TtsLanguageVoice | undefined {
  const candidates = voices.filter(predicate)
  return filterTtsVoicesForLanguage(candidates, language)[0]
}

export function resolveReaderTtsSelection(
  config: MobileTtsConfig,
  language: string,
): ReaderTtsSelection {
  if (config.defaultEngine.kind !== "provider") {
    return {
      kind: "system",
      voiceId: matchingVoice(
        config.voices,
        language,
        (voice) => voice.engine === "system",
      )?.voiceId,
    }
  }

  const profileId = config.defaultEngine.profileId
  const profile = config.profiles.find(
    (candidate) => candidate.id === profileId && candidate.enabled,
  )
  if (!profile) throw new Error("TTS_DEFAULT_PROFILE_NOT_FOUND")

  const mappedVoiceId = matchingVoice(
    config.voices,
    language,
    (voice) => voice.engine === "provider" && voice.profileId === profile.id,
  )?.voiceId

  return {
    kind: "provider",
    profile,
    voiceId:
      (mappedVoiceId && profile.voices.includes(mappedVoiceId)
        ? mappedVoiceId
        : undefined) ??
      profile.defaultVoice ??
      profile.voices[0],
  }
}

export function chooseReaderTtsVoice(
  voices: TtsVoice[],
  language: string,
): TtsVoice | undefined {
  return chooseTtsVoiceForLanguage(voices, language)
}

export function buildReaderTtsEngineConfig(
  config: MobileTtsConfig,
  selection: ReaderTtsSelection,
  language: string,
  highlightColor: string,
): TtsEngineConfig {
  const engineConfig: TtsEngineConfig = {
    kind: selection.kind,
    speed: config.playback.speed,
    pitch: config.playback.pitch,
    highlightColor,
  }
  if (selection.kind === "provider") {
    engineConfig.profileId = selection.profile.id
  }
  if (selection.voiceId) engineConfig.voiceId = selection.voiceId
  const normalized = normalizedLanguage(language)
  if (normalized !== "und") engineConfig.language = normalized
  return engineConfig
}

export function buildReaderTtsSynthesisRequest(
  request: {
    profileId: string
    text: string
    language?: string
    voiceId: string
    speed: number
  },
  acceptedMimeTypes: string[],
): TtsSynthesisRequest {
  return {
    profileId: request.profileId,
    text: request.text,
    language: request.language,
    voiceId: request.voiceId,
    speed: request.speed,
    acceptedMimeTypes,
    cachePolicy: "use",
  }
}
