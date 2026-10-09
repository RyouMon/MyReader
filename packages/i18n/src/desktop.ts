import type { SupportedLanguage } from "./languages"
import { sharedResources } from "./shared-resources"
import {
  mergeTranslationResources,
  type TranslationResource,
} from "./merge-resources"
import type { TranslationKey } from "./translation-key"
import { desktopEn } from "./locales/desktop/en"
import { desktopZhCN } from "./locales/desktop/zh-CN"
import desktopZhHant from "./locales/desktop/zh-Hant.json"
import desktopJa from "./locales/desktop/ja.json"
import desktopKo from "./locales/desktop/ko.json"
import desktopEs from "./locales/desktop/es.json"
import desktopFr from "./locales/desktop/fr.json"
import desktopDe from "./locales/desktop/de.json"
import desktopPtBR from "./locales/desktop/pt-BR.json"
import desktopIt from "./locales/desktop/it.json"
import desktopRu from "./locales/desktop/ru.json"

export type { SupportedLanguage } from "./languages"
export { SUPPORTED_LANGUAGES } from "./languages"

export const desktopResources = {
  en: {
    translation: mergeTranslationResources(
      sharedResources["en"],
      desktopEn.translation,
    ),
  },
  "zh-CN": {
    translation: mergeTranslationResources(
      sharedResources["zh-CN"],
      desktopZhCN.translation,
    ),
  },
  "zh-Hant": {
    translation: mergeTranslationResources(
      sharedResources["zh-Hant"],
      desktopZhHant,
    ),
  },
  ja: {
    translation: mergeTranslationResources(sharedResources["ja"], desktopJa),
  },
  ko: {
    translation: mergeTranslationResources(sharedResources["ko"], desktopKo),
  },
  es: {
    translation: mergeTranslationResources(sharedResources["es"], desktopEs),
  },
  fr: {
    translation: mergeTranslationResources(sharedResources["fr"], desktopFr),
  },
  de: {
    translation: mergeTranslationResources(sharedResources["de"], desktopDe),
  },
  "pt-BR": {
    translation: mergeTranslationResources(
      sharedResources["pt-BR"],
      desktopPtBR,
    ),
  },
  it: {
    translation: mergeTranslationResources(sharedResources["it"], desktopIt),
  },
  ru: {
    translation: mergeTranslationResources(sharedResources["ru"], desktopRu),
  },
} satisfies Record<SupportedLanguage, { translation: TranslationResource }>

export type DesktopTranslationKey = TranslationKey<
  typeof desktopResources.en.translation
>
export { qwenTtsSourceKeys } from "./qwen-tts"
