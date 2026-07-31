import { desktopResources, SUPPORTED_LANGUAGES } from "@my-reader/i18n/desktop"
import i18n from "i18next"
import { initReactI18next } from "react-i18next"

i18n.use(initReactI18next).init({
  resources: desktopResources,
  lng: "zh-CN",
  fallbackLng: "zh-CN",
  supportedLngs: SUPPORTED_LANGUAGES,
  interpolation: { escapeValue: false },
})

export default i18n
