export type TtsSelectionUsage = {
  profileId: string
  voiceId?: string | null
  language?: string | null
  libraryName?: string | null
  scopeName?: string | null
  bookId?: number | null
  characterName?: string | null
}

export type TtsVoiceCatalog = {
  id: string
  kind: string
  modelScopedVoices?: boolean
  voices: string[]
  models: { id: string; voices: string[] }[]
}

export function ttsModelVoices(provider: TtsVoiceCatalog) {
  return provider.models.map((model) => ({
    id: model.id,
    voices:
      provider.kind === "qwen" || provider.modelScopedVoices
        ? model.voices
        : provider.voices,
  }))
}

export function ttsUsageMessage(
  usages: TtsSelectionUsage[],
  t: (key: string, values?: Record<string, unknown>) => string,
) {
  if (!usages.length) return ""
  const locations = new Set(
    usages.map((usage) =>
      usage.characterName
        ? [
            usage.libraryName,
            usage.scopeName || t("ttsRemoval.book", { id: usage.bookId }),
            usage.characterName,
          ]
            .filter(Boolean)
            .join(" · ")
        : t("ttsRemoval.global"),
    ),
  )
  return t("ttsRemoval.reset", {
    usages: [...locations].map((name) => `• ${name}`).join("\n"),
  })
}
