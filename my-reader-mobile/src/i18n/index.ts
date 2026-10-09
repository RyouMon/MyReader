import "../polyfills/intl-plural-rules"
import { FALLBACK_LANGUAGE, resolveLanguage } from "@my-reader/i18n/languages"
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
  const preferences =
    language && language !== "system"
      ? [language]
      : getLocales().map(
          (locale) => locale.languageTag || locale.languageCode || "",
        )
  return resolveLanguage(preferences)
}

i18n.use(initReactI18next).init({
  resources: mobileResources,
  lng: resolveAppLanguage(null),
  fallbackLng: FALLBACK_LANGUAGE,
  returnEmptyString: false,
  supportedLngs: SUPPORTED_LANGUAGES,
  interpolation: { escapeValue: false },
})

export function changeLanguage(language: string) {
  return i18n.changeLanguage(language)
}

export default i18n
