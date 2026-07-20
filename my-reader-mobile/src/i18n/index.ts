import i18n from "i18next"
import { initReactI18next } from "react-i18next"
import { getLocales } from "expo-localization"

import zh from "./locales/zh.json"
import en from "./locales/en.json"

const SUPPORTED_LANGUAGES = ["zh", "en"] as const
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

export function resolveAppLanguage(
  language: string | null | undefined,
): SupportedLanguage {
  const preferredLanguage = language || getLocales()[0]?.languageCode || "zh"

  return SUPPORTED_LANGUAGES.includes(preferredLanguage as SupportedLanguage)
    ? (preferredLanguage as SupportedLanguage)
    : "zh"
}

i18n.use(initReactI18next).init({
  resources: {
    zh: { translation: zh },
    en: { translation: en },
  },
  lng: resolveAppLanguage(null),
  fallbackLng: "zh",
  interpolation: { escapeValue: false },
})

export function changeLanguage(language: string) {
  return i18n.changeLanguage(language)
}

export function getCurrentLanguage(): string {
  return i18n.language
}

export default i18n
