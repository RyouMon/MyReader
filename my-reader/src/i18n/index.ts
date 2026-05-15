import i18n from "i18next"
import { initReactI18next } from "react-i18next"
import { en } from "./locales/en"
import { zhCN } from "./locales/zh-CN"

i18n.use(initReactI18next).init({
  resources: { "zh-CN": zhCN, en },
  lng: "zh-CN",
  fallbackLng: "zh-CN",
  interpolation: { escapeValue: false },
})

export default i18n
