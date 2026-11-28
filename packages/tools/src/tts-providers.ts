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

export type TtsRegionContext = {
  regionCode?: string | null
  timeZone?: string | null
  locale?: string | null
  locales?: readonly (string | null | undefined)[] | null
}

export type TtsEndpointSuggestionLabelKey =
  | "ttsProviders.volcengine"
  | "ttsProviders.endpoints.china"
  | "ttsProviders.endpoints.international"
  | "ttsProviders.endpoints.dashscopeChina"
  | "ttsProviders.endpoints.dashscopeInternational"
  | "ttsProviders.endpoints.qianwen"
  | "ttsProviders.endpoints.qwenTokenPlan"

export type TtsEndpointSuggestion = {
  url: string
  labelKey?: TtsEndpointSuggestionLabelKey
  fallbackLabel?: string
}

export type TtsCredentialDraftState = {
  credential?: string | null
  hasCredential?: boolean
  clearCredential?: boolean
}

const QWEN_CHINA_ENDPOINT = "https://dashscope.aliyuncs.com/api/v1"
const QWEN_INTERNATIONAL_ENDPOINT = "https://dashscope-intl.aliyuncs.com/api/v1"
const QWEN_QIANWEN_ENDPOINT = "https://maas.qianwenaiapi.com/api/v1"
const QWEN_TOKEN_PLAN_ENDPOINT =
  "wss://token-plan.maas.qianwenaiapi.com/api-ws/v1/inference"
const MINIMAX_CHINA_ENDPOINT = "https://api.minimaxi.com"
const MINIMAX_INTERNATIONAL_ENDPOINT = "https://api.minimax.io"

const CHINA_MAINLAND_TIMEZONES = new Set([
  "Asia/Shanghai",
  "Asia/Chongqing",
  "Asia/Chungking",
  "Asia/Harbin",
  "Asia/Kashgar",
  "Asia/Urumqi",
  "PRC",
])

const GENERIC_UTC_TIMEZONES = new Set([
  "UTC",
  "Etc/UTC",
  "Etc/GMT",
  "GMT",
  "Etc/UCT",
  "UCT",
  "Universal",
])

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
    defaultEndpoint: QWEN_CHINA_ENDPOINT,
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
    defaultEndpoint: MINIMAX_CHINA_ENDPOINT,
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

function localeRegionCode(tag: string | null | undefined): string | null {
  const trimmed = tag?.trim()
  if (!trimmed) return null
  if (typeof Intl !== "undefined" && typeof Intl.Locale === "function") {
    try {
      const region = new Intl.Locale(trimmed).region
      if (region) return region.toUpperCase()
    } catch {
      // Fall back to subtag parsing for non-canonical locale strings.
    }
  }
  const parts = trimmed.split(/[-_]/).slice(1)
  for (const part of parts) {
    if (/^[A-Za-z]{2}$/.test(part)) return part.toUpperCase()
  }
  return null
}

export function detectRuntimeRegionContext(): TtsRegionContext {
  let timeZone: string | undefined
  let resolvedLocale: string | undefined
  if (
    typeof Intl !== "undefined" &&
    typeof Intl.DateTimeFormat === "function"
  ) {
    try {
      const resolved = Intl.DateTimeFormat().resolvedOptions()
      timeZone = resolved.timeZone
      resolvedLocale = resolved.locale
    } catch {
      // Ignore environments without Intl timezone metadata.
    }
  }
  const locales: string[] = []
  if (typeof navigator !== "undefined") {
    if (Array.isArray(navigator.languages)) locales.push(...navigator.languages)
    if (navigator.language) locales.push(navigator.language)
  }
  if (resolvedLocale) locales.push(resolvedLocale)
  return { timeZone, locales }
}

export function isChinaMainlandRegion(
  context: TtsRegionContext = detectRuntimeRegionContext(),
): boolean {
  const explicitRegion = context.regionCode?.trim()
  if (explicitRegion) return explicitRegion.toUpperCase() === "CN"

  const timeZone = context.timeZone?.trim()
  if (timeZone && !GENERIC_UTC_TIMEZONES.has(timeZone)) {
    return CHINA_MAINLAND_TIMEZONES.has(timeZone)
  }

  const candidates = [
    ...(context.locale ? [context.locale] : []),
    ...(context.locales ?? []),
  ]
  for (const tag of candidates) {
    const region = localeRegionCode(tag)
    if (region) return region === "CN"
  }
  return false
}

export function ttsDefaultEndpoint(
  kind: string,
  region?: TtsRegionContext | boolean,
): string {
  const isChina =
    typeof region === "boolean" ? region : isChinaMainlandRegion(region)
  if (kind === "qwen") {
    return isChina ? QWEN_CHINA_ENDPOINT : QWEN_INTERNATIONAL_ENDPOINT
  }
  if (kind === "miniMax") {
    return isChina ? MINIMAX_CHINA_ENDPOINT : MINIMAX_INTERNATIONAL_ENDPOINT
  }
  return ttsProviderMeta(kind).defaultEndpoint
}

export function ttsEndpointSuggestions(
  kind: string,
  region?: TtsRegionContext | boolean,
): TtsEndpointSuggestion[] {
  const isChina =
    typeof region === "boolean" ? region : isChinaMainlandRegion(region)
  if (kind === "qwen") {
    const china: TtsEndpointSuggestion = {
      url: QWEN_CHINA_ENDPOINT,
      labelKey: "ttsProviders.endpoints.dashscopeChina",
    }
    const international: TtsEndpointSuggestion = {
      url: QWEN_INTERNATIONAL_ENDPOINT,
      labelKey: "ttsProviders.endpoints.dashscopeInternational",
    }
    return [
      ...(isChina ? [china, international] : [international, china]),
      {
        url: QWEN_QIANWEN_ENDPOINT,
        labelKey: "ttsProviders.endpoints.qianwen",
      },
      {
        url: QWEN_TOKEN_PLAN_ENDPOINT,
        labelKey: "ttsProviders.endpoints.qwenTokenPlan",
      },
    ]
  }
  if (kind === "miniMax") {
    const china: TtsEndpointSuggestion = {
      url: MINIMAX_CHINA_ENDPOINT,
      labelKey: "ttsProviders.endpoints.china",
    }
    const international: TtsEndpointSuggestion = {
      url: MINIMAX_INTERNATIONAL_ENDPOINT,
      labelKey: "ttsProviders.endpoints.international",
    }
    return isChina ? [china, international] : [international, china]
  }
  const meta = ttsProviderMeta(kind)
  if (!meta.defaultEndpoint) return []
  return [
    {
      url: meta.defaultEndpoint,
      labelKey:
        meta.kind === "volcengine" ? "ttsProviders.volcengine" : undefined,
      fallbackLabel: meta.defaultName,
    },
  ]
}

export function hasEffectiveTtsCredential(
  draft: TtsCredentialDraftState,
): boolean {
  if (draft.credential?.trim()) return true
  return Boolean(draft.hasCredential && !draft.clearCredential)
}

function errorDetailText(error: unknown): string {
  if (typeof error === "string") return error
  if (error && typeof error === "object") {
    const parts: string[] = []
    if ("message" in error && typeof error.message === "string")
      parts.push(error.message)
    if ("inner" in error && typeof error.inner === "object" && error.inner) {
      const inner = error.inner as Record<string, unknown>
      if (typeof inner.message === "string") parts.push(inner.message)
    }
    if (parts.length) return parts.join(" ")
  }
  return String(error ?? "")
}

export function isTtsCredentialRequiredError(
  error: unknown,
  draft?: TtsCredentialDraftState,
  errorKind?: string,
): boolean {
  if (!error) return false
  const detail = errorDetailText(error)
  if (detail.includes("TTS_CREDENTIAL_REQUIRED")) return true
  if (draft && !hasEffectiveTtsCredential(draft)) {
    const normalizedKind = errorKind?.toLowerCase()
    if (
      normalizedKind === "credential" ||
      normalizedKind === "auth" ||
      normalizedKind === "unauthorized"
    ) {
      return true
    }
    if (/\b(unauthorized|http_401)\b/i.test(detail)) return true
  }
  return false
}
