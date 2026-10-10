import type { Locator, TtsEngineConfig } from "@my-reader/readium"
import { ttsMaximumPlaybackSpeed } from "@/src/constants/tts"
import {
  chooseTtsVoiceForLanguage,
  filterTtsVoicesForLanguage,
  normalizeTtsLanguage,
} from "@my-reader/tools/reader-tts-language"
import {
  hrefRoughlyMatches,
  positionIndexForLocator,
} from "@my-reader/tools/reader-toc"

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

export type ReaderTtsViewportRelation = "before" | "after" | null

type ReaderTtsViewportRelationInput = {
  viewportDetached: boolean
  viewportLocator?: Locator
  viewportOriginLocator?: Locator
  playbackLocator?: Locator
  positions: readonly Locator[]
}

function compareLocationNumbers(
  viewportValue: number | undefined,
  playbackValue: number | undefined,
): ReaderTtsViewportRelation {
  if (
    viewportValue == null ||
    playbackValue == null ||
    !Number.isFinite(viewportValue) ||
    !Number.isFinite(playbackValue) ||
    viewportValue === playbackValue
  ) {
    return null
  }
  return viewportValue < playbackValue ? "before" : "after"
}

export function resolveReaderTtsViewportRelation({
  viewportDetached,
  viewportLocator,
  viewportOriginLocator,
  playbackLocator,
  positions,
}: ReaderTtsViewportRelationInput): ReaderTtsViewportRelation {
  if (!viewportDetached || !viewportLocator || !playbackLocator) return null

  const originRelation = viewportOriginLocator
    ? compareReaderTtsLocators(
        viewportLocator,
        viewportOriginLocator,
        positions,
      )
    : null
  if (originRelation) return originRelation

  return compareReaderTtsLocators(viewportLocator, playbackLocator, positions)
}

function compareReaderTtsLocators(
  viewportLocator: Locator,
  playbackLocator: Locator,
  positions: readonly Locator[],
): ReaderTtsViewportRelation {
  const totalProgressionRelation = compareLocationNumbers(
    viewportLocator.locations?.totalProgression,
    playbackLocator.locations?.totalProgression,
  )
  if (totalProgressionRelation) return totalProgressionRelation

  const positionRelation = compareLocationNumbers(
    viewportLocator.locations?.position,
    playbackLocator.locations?.position,
  )
  if (positionRelation) return positionRelation

  if (hrefRoughlyMatches(viewportLocator.href, playbackLocator.href)) {
    const progressionRelation = compareLocationNumbers(
      viewportLocator.locations?.progression,
      playbackLocator.locations?.progression,
    )
    if (progressionRelation) return progressionRelation
  }

  return compareLocationNumbers(
    positionIndexForLocator(positions, viewportLocator),
    positionIndexForLocator(positions, playbackLocator),
  )
}

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
    error === "TTS_PROVIDER_UNAVAILABLE" ||
    error === "TTS_NETWORK_ERROR" ||
    error === "TTS_REQUEST_TIMEOUT"
  ) {
    return { kind: "providerUnavailable" }
  }
  return { kind: "unknown" }
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
      (mappedVoiceId &&
      (profile.kind === "qwen" || profile.voices.includes(mappedVoiceId))
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
    speed: Math.min(
      config.playback.speed,
      ttsMaximumPlaybackSpeed(
        selection.kind === "provider" ? selection.profile : undefined,
      ),
    ),
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
