import {
  normalizeTtsAudioFormat,
  type TtsAudioFormat,
} from "@/src/constants/tts"
import type { MobileTtsProviderProfile } from "@/src/services/core/tts"

export type ProviderDraft = {
  id?: string
  kind: "openAiCompatible" | "qwen"
  name: string
  endpoint: string
  model: string
  responseFormat: TtsAudioFormat
  credential: string
  instructions: string
  voices: string
  defaultVoice: string
  enabled: boolean
  hasCredential: boolean
  clearCredential: boolean
}

export function newProviderDraft(): ProviderDraft {
  return {
    kind: "openAiCompatible",
    name: "OpenAI",
    endpoint: "https://api.openai.com/v1",
    model: "gpt-4o-mini-tts",
    responseFormat: "mp3",
    credential: "",
    instructions: "",
    voices: "",
    defaultVoice: "",
    enabled: true,
    hasCredential: false,
    clearCredential: false,
  }
}

export function existingProviderDraft(
  profile: MobileTtsProviderProfile,
): ProviderDraft {
  return {
    id: profile.id,
    kind: profile.kind as ProviderDraft["kind"],
    name: profile.name,
    endpoint: profile.endpoint,
    model: profile.model ?? "",
    responseFormat: normalizeTtsAudioFormat(profile.responseFormat),
    credential: "",
    instructions: profile.instructions ?? "",
    voices: profile.voices.join("\n"),
    defaultVoice: profile.defaultVoice ?? "",
    enabled: profile.enabled,
    hasCredential: profile.hasCredential,
    clearCredential: false,
  }
}

export function parseVoiceIds(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/\r?\n/)
        .map((voice) => voice.trim())
        .filter(Boolean),
    ),
  ]
}

export function canSaveProviderDraft(
  providerDraft: ProviderDraft | null,
): boolean {
  if (!providerDraft) return false
  const voiceIds = parseVoiceIds(
    providerDraft.voices +
      (providerDraft.kind === "qwen" ? `\n${providerDraft.defaultVoice}` : ""),
  )
  return Boolean(
    providerDraft.name.trim() &&
      providerDraft.endpoint.trim() &&
      providerDraft.model.trim() &&
      voiceIds.length > 0 &&
      providerDraft.defaultVoice.trim() &&
      voiceIds.includes(providerDraft.defaultVoice.trim()),
  )
}
