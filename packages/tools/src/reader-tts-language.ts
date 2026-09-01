export type TtsLanguageVoice = {
  language?: string | null
}

export function normalizeTtsLanguage(
  language: string | null | undefined,
): string {
  const value = (language ?? "").trim().replace(/_/g, "-")
  if (!value) return ""
  try {
    return (Intl.getCanonicalLocales(value)[0] ?? value).toLowerCase()
  } catch {
    return value.toLowerCase()
  }
}

export function primaryTtsLanguage(
  language: string | null | undefined,
): string {
  return normalizeTtsLanguage(language).split("-")[0] ?? ""
}

type LanguageDisplayNames = {
  of(language: string): string | undefined
}

type LanguageDisplayNamesConstructor = new (
  locales: string | string[],
  options: { type: "language" },
) => LanguageDisplayNames

export function formatTtsLanguageName(
  language: string | null | undefined,
  locale: string | null | undefined,
): string {
  const normalized = normalizeTtsLanguage(language)
  if (!normalized) return ""

  const displayLocale = normalizeTtsLanguage(locale) || "en"
  const interfaceLanguage = primaryTtsLanguage(displayLocale)
  if (normalized === "mul") {
    if (interfaceLanguage === "zh") return "多语言"
    if (interfaceLanguage === "en") return "Multilingual"
  }
  if (normalized === "und") {
    if (interfaceLanguage === "zh") return "未指定语言"
    if (interfaceLanguage === "en") return "Unspecified language"
  }

  const DisplayNames = (
    Intl as typeof Intl & { DisplayNames?: LanguageDisplayNamesConstructor }
  ).DisplayNames
  if (!DisplayNames) return normalized

  try {
    return (
      new DisplayNames(displayLocale, { type: "language" }).of(normalized) ??
      normalized
    )
  } catch {
    return normalized
  }
}

function languageMatchRank(
  candidate: string | null | undefined,
  requested: string | null | undefined,
): number {
  const voice = normalizeTtsLanguage(candidate)
  const content = normalizeTtsLanguage(requested)
  if (!content || content === "und") {
    if (voice === "und") return 0
    if (voice === "mul") return 1
    return 2
  }
  if (content === "mul") {
    if (voice === "mul") return 0
    if (voice === "und") return 1
    return 2
  }
  if (voice === content) return 0
  if (primaryTtsLanguage(voice) === primaryTtsLanguage(content)) return 1
  if (voice === "mul") return 2
  if (voice === "und") return 3
  return Number.POSITIVE_INFINITY
}

export function ttsLanguageMatches(
  candidate: string | null | undefined,
  requested: string | null | undefined,
): boolean {
  return Number.isFinite(languageMatchRank(candidate, requested))
}

export function filterTtsVoicesForLanguage<T extends TtsLanguageVoice>(
  voices: readonly T[],
  language: string | null | undefined,
): T[] {
  return voices
    .map((voice, index) => ({
      voice,
      index,
      rank: languageMatchRank(voice.language, language),
    }))
    .filter(({ rank }) => Number.isFinite(rank))
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .map(({ voice }) => voice)
}

export function chooseTtsVoiceForLanguage<T extends TtsLanguageVoice>(
  voices: readonly T[],
  language: string | null | undefined,
): T | undefined {
  return filterTtsVoicesForLanguage(voices, language)[0] ?? voices[0]
}
