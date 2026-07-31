import {
  mobileResources,
  SUPPORTED_LANGUAGES,
  type SupportedLanguage,
} from "@my-reader/i18n/mobile"
import { getLocales } from "expo-localization"
import i18n from "i18next"
import { initReactI18next } from "react-i18next"

export type { SupportedLanguage } from "@my-reader/i18n/mobile"

export function resolveAppLanguage(
  language: string | null | undefined,
): SupportedLanguage {
  const systemLocale = getLocales()[0]
  const preferredLanguage =
    language && language !== "system"
      ? language
      : systemLocale?.languageTag || systemLocale?.languageCode || "zh-CN"
  const normalizedLanguage = preferredLanguage.replace("_", "-").toLowerCase()

  if (normalizedLanguage.startsWith("en")) return "en"
  if (normalizedLanguage.startsWith("zh")) return "zh-CN"
  return "zh-CN"
}

i18n.use(initReactI18next).init({
  resources: mobileResources,
  lng: resolveAppLanguage(null),
  fallbackLng: "zh-CN",
  supportedLngs: SUPPORTED_LANGUAGES,
  interpolation: { escapeValue: false },
})

export function changeLanguage(language: string) {
  return i18n.changeLanguage(language)
}

export function getCurrentLanguage(): string {
  return i18n.language
}

export default i18n
