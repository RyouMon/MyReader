import type { SupportedLanguage } from "./languages"
import { sharedResources } from "./shared-resources"
import {
  mergeTranslationResources,
  type TranslationResource,
} from "./merge-resources"
import type { TranslationKey } from "./translation-key"
import mobileEn from "./locales/mobile/en.json"
import mobileZhCN from "./locales/mobile/zh-CN.json"
import mobileZhHant from "./locales/mobile/zh-Hant.json"
import mobileJa from "./locales/mobile/ja.json"
import mobileKo from "./locales/mobile/ko.json"
import mobileEs from "./locales/mobile/es.json"
import mobileFr from "./locales/mobile/fr.json"
import mobileDe from "./locales/mobile/de.json"
import mobilePtBR from "./locales/mobile/pt-BR.json"
import mobileIt from "./locales/mobile/it.json"
import mobileRu from "./locales/mobile/ru.json"

export type { SupportedLanguage } from "./languages"
export { SUPPORTED_LANGUAGES } from "./languages"

export const mobileResources = {
  en: {
    translation: mergeTranslationResources(sharedResources["en"], mobileEn),
  },
  "zh-CN": {
    translation: mergeTranslationResources(
      sharedResources["zh-CN"],
      mobileZhCN,
    ),
  },
  "zh-Hant": {
    translation: mergeTranslationResources(
      sharedResources["zh-Hant"],
      mobileZhHant,
    ),
  },
  ja: {
    translation: mergeTranslationResources(sharedResources["ja"], mobileJa),
  },
  ko: {
    translation: mergeTranslationResources(sharedResources["ko"], mobileKo),
  },
  es: {
    translation: mergeTranslationResources(sharedResources["es"], mobileEs),
  },
  fr: {
    translation: mergeTranslationResources(sharedResources["fr"], mobileFr),
  },
  de: {
    translation: mergeTranslationResources(sharedResources["de"], mobileDe),
  },
  "pt-BR": {
    translation: mergeTranslationResources(
      sharedResources["pt-BR"],
      mobilePtBR,
    ),
  },
  it: {
    translation: mergeTranslationResources(sharedResources["it"], mobileIt),
  },
  ru: {
    translation: mergeTranslationResources(sharedResources["ru"], mobileRu),
  },
} satisfies Record<SupportedLanguage, { translation: TranslationResource }>

export type MobileTranslationKey = TranslationKey<
  typeof mobileResources.en.translation
>
export { qwenTtsSourceKeys } from "./qwen-tts"
export { syncFailureDetail, syncFailureKeys } from "./sync-failure"
export { errorMessageKey } from "./error-message"
