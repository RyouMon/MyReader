export const TTS_PROVIDER_KINDS = [
  "openAiCompatible",
  "qwen",
  "miniMax",
  "volcengine",
  "elevenLabs",
  "fishAudio",
  "gemini",
] as const

export type TtsProviderKind = (typeof TTS_PROVIDER_KINDS)[number]
export type TtsAudioFormat = "mp3" | "opus" | "aac" | "flac" | "wav"

export type TtsProviderMetadata = {
  kind: TtsProviderKind
  defaultName: string
  defaultEndpoint: string
  defaultModel: string
  defaultFormat: TtsAudioFormat
  forcesModelScopedVoices: boolean
  allowsCustomVoiceScope: boolean
  supportsVoiceDiscovery: boolean
  supportsWebSocket: boolean
  requiresCredential: boolean
}

const PROVIDER_METADATA: Record<TtsProviderKind, TtsProviderMetadata> = {
  openAiCompatible: {
    kind: "openAiCompatible",
    defaultName: "OpenAI",
    defaultEndpoint: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini-tts",
    defaultFormat: "mp3",
    forcesModelScopedVoices: false,
    allowsCustomVoiceScope: true,
    supportsVoiceDiscovery: true,
    supportsWebSocket: false,
    requiresCredential: false,
  },
  qwen: {
    kind: "qwen",
    defaultName: "Qwen",
    defaultEndpoint: "",
    defaultModel: "",
    defaultFormat: "wav",
    forcesModelScopedVoices: true,
    allowsCustomVoiceScope: false,
    supportsVoiceDiscovery: true,
    supportsWebSocket: true,
    requiresCredential: true,
  },
  miniMax: {
    kind: "miniMax",
    defaultName: "MiniMax",
    defaultEndpoint: "https://api.minimaxi.com",
    defaultModel: "speech-2.8-turbo",
    defaultFormat: "mp3",
    forcesModelScopedVoices: false,
    allowsCustomVoiceScope: false,
    supportsVoiceDiscovery: true,
    supportsWebSocket: false,
    requiresCredential: true,
  },
  volcengine: {
    kind: "volcengine",
    defaultName: "Volcengine",
    defaultEndpoint:
      "https://openspeech.bytedance.com/api/v3/tts/unidirectional",
    defaultModel: "seed-tts-2.0",
    defaultFormat: "mp3",
    forcesModelScopedVoices: true,
    allowsCustomVoiceScope: false,
    supportsVoiceDiscovery: false,
    supportsWebSocket: false,
    requiresCredential: true,
  },
  elevenLabs: {
    kind: "elevenLabs",
    defaultName: "ElevenLabs",
    defaultEndpoint: "https://api.elevenlabs.io",
    defaultModel: "eleven_multilingual_v2",
    defaultFormat: "mp3",
    forcesModelScopedVoices: false,
    allowsCustomVoiceScope: false,
    supportsVoiceDiscovery: true,
    supportsWebSocket: false,
    requiresCredential: true,
  },
  fishAudio: {
    kind: "fishAudio",
    defaultName: "Fish Audio",
    defaultEndpoint: "https://api.fish.audio",
    defaultModel: "s2.1-pro-free",
    defaultFormat: "mp3",
    forcesModelScopedVoices: false,
    allowsCustomVoiceScope: false,
    supportsVoiceDiscovery: true,
    supportsWebSocket: false,
    requiresCredential: true,
  },
  gemini: {
    kind: "gemini",
    defaultName: "Google Gemini",
    defaultEndpoint: "https://generativelanguage.googleapis.com",
    defaultModel: "gemini-2.5-flash-preview-tts",
    defaultFormat: "wav",
    forcesModelScopedVoices: false,
    allowsCustomVoiceScope: false,
    supportsVoiceDiscovery: true,
    supportsWebSocket: false,
    requiresCredential: true,
  },
}

export function isTtsProviderKind(value: string): value is TtsProviderKind {
  return (TTS_PROVIDER_KINDS as readonly string[]).includes(value)
}

export function ttsProviderMeta(kind: string): TtsProviderMetadata {
  return isTtsProviderKind(kind)
    ? PROVIDER_METADATA[kind]
    : PROVIDER_METADATA.openAiCompatible
}

export function ttsUsesModelScopedVoices(provider: {
  kind: string
  modelScopedVoices?: boolean
}): boolean {
  return (
    ttsProviderMeta(provider.kind).forcesModelScopedVoices ||
    Boolean(provider.modelScopedVoices)
  )
}

export function ttsMaximumPlaybackSpeedForProfile(profile?: {
  kind: string
  model?: string | null
}): number {
  if (!profile) return 3
  const model = profile.model?.toLowerCase() ?? ""
  if (
    profile.kind === "gemini" ||
    (profile.kind === "qwen" && model.startsWith("qwen3-")) ||
    (profile.kind === "elevenLabs" &&
      (model.startsWith("eleven_v3") || model.startsWith("eleven_v4")))
  ) {
    return 2
  }
  return 3
}

export function mergeDiscoveredTtsVoices(
  existingVoices: string[],
  existingNames: Record<string, string> | null | undefined,
  incoming: { id: string; name?: string | null }[],
): { voices: string[]; voiceNames: Record<string, string> } {
  const voices = [
    ...new Set([
      ...existingVoices.map((id) => id.trim()).filter(Boolean),
      ...incoming.map((voice) => voice.id.trim()).filter(Boolean),
    ]),
  ]
  const voiceNames: Record<string, string> = { ...(existingNames ?? {}) }
  for (const voice of incoming) {
    const id = voice.id.trim()
    const name = voice.name?.trim()
    if (id && name && !voiceNames[id]?.trim()) {
      voiceNames[id] = name
    }
  }
  return {
    voices: voices.length ? voices : [""],
    voiceNames,
  }
}
