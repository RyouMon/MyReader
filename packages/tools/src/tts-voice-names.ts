import { formatTtsLanguageName } from "./reader-tts-language"

export type TtsVoiceNames = Record<string, string> | null | undefined

export function ttsVoiceLabel(
  id: string,
  names?: TtsVoiceNames,
  language?: string | null,
  locale?: string,
): string {
  const name = names?.[id]?.trim() || id
  const languageName = formatTtsLanguageName(language, locale)
  return languageName ? `${name} · ${languageName}` : name
}

export function characterVoiceLabel(
  voice:
    | {
        engine: string
        voiceId: string
        profileId?: string | null
      }
    | null
    | undefined,
  profiles: { id: string; voiceNames?: TtsVoiceNames }[],
  labels: { defaultModel: string; system: string },
  options: {
    systemVoices?: { id: string; name: string; language?: string }[]
    providerVoices?: Record<string, { id: string; language: string }[]>
    locale?: string
  } = {},
): string {
  if (!voice) return labels.defaultModel
  if (voice.engine === "system") {
    const system = options.systemVoices?.find(
      (item) => item.id === voice.voiceId,
    )
    return ttsVoiceLabel(
      system?.name || voice.voiceId || labels.system,
      undefined,
      system?.language,
      options.locale,
    )
  }
  return ttsVoiceLabel(
    voice.voiceId,
    profiles.find((profile) => profile.id === voice.profileId)?.voiceNames,
    options.providerVoices?.[voice.profileId ?? ""]?.find(
      (item) => item.id === voice.voiceId,
    )?.language,
    options.locale,
  )
}

// Empty draft rows need separate keys until their required voice IDs are filled.
export function ttsVoiceNameKey(id: string, index: number): string {
  return id || `\0${index}`
}

export function updateTtsVoiceNames(
  previous: string[],
  next: string[],
  names: TtsVoiceNames,
  removedIndex?: number,
): Record<string, string> {
  return Object.fromEntries(
    next.flatMap((id, index) => {
      const oldIndex =
        removedIndex !== undefined && index >= removedIndex ? index + 1 : index
      const previousId = previous[oldIndex]
      const name =
        previousId === undefined
          ? undefined
          : names?.[ttsVoiceNameKey(previousId, oldIndex)]
      return name ? [[ttsVoiceNameKey(id, index), name]] : []
    }),
  )
}
