import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { getLocales } from "expo-localization";

import zh from "./locales/zh.json";
import en from "./locales/en.json";

const SUPPORTED_LANGUAGES = ["zh", "en"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

const deviceLanguage = getLocales()[0]?.languageCode ?? "zh";
const initialLanguage = SUPPORTED_LANGUAGES.includes(deviceLanguage as SupportedLanguage)
  ? deviceLanguage
  : "zh";

i18n.use(initReactI18next).init({
  resources: {
    zh: { translation: zh },
    en: { translation: en },
  },
  lng: initialLanguage,
  fallbackLng: "zh",
  interpolation: { escapeValue: false },
});

export function changeLanguage(language: string) {
  void i18n.changeLanguage(language);
}

export function getCurrentLanguage(): string {
  return i18n.language;
}

export default i18n;