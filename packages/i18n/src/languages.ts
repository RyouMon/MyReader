export const SUPPORTED_LANGUAGES = [
  "en",
  "zh-CN",
  "zh-Hant",
  "ja",
  "ko",
  "es",
  "fr",
  "de",
  "pt-BR",
  "it",
  "ru",
] as const

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

export const FALLBACK_LANGUAGE: SupportedLanguage = "en"

export const LANGUAGE_NAMES: Record<SupportedLanguage, string> = {
  en: "English",
  "zh-CN": "简体中文",
  "zh-Hant": "繁體中文",
  ja: "日本語",
  ko: "한국어",
  es: "Español",
  fr: "Français",
  de: "Deutsch",
  "pt-BR": "Português (Brasil)",
  it: "Italiano",
  ru: "Русский",
}

export function matchLanguage(language: string): SupportedLanguage | undefined {
  const [base, ...subtags] = language
    .replace(/_/g, "-")
    .toLowerCase()
    .split("-")
  if (base === "zh") {
    if (subtags.includes("hant")) return "zh-Hant"
    if (subtags.includes("hans")) return "zh-CN"
    return subtags.some((tag) => ["tw", "hk", "mo"].includes(tag))
      ? "zh-Hant"
      : "zh-CN"
  }
  if (base === "pt") return "pt-BR"
  return SUPPORTED_LANGUAGES.find((supported) => supported === base)
}

export function resolveLanguage(
  languages: readonly string[],
): SupportedLanguage {
  for (const language of languages) {
    const supported = matchLanguage(language)
    if (supported) return supported
  }
  return FALLBACK_LANGUAGE
}
