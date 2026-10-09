import type { SupportedLanguage } from "./languages"
import type { TranslationResource } from "./merge-resources"
import { sharedEn } from "./locales/shared/en"
import { sharedZhCN } from "./locales/shared/zh-CN"
import sharedZhHant from "./locales/shared/zh-Hant.json"
import sharedJa from "./locales/shared/ja.json"
import sharedKo from "./locales/shared/ko.json"
import sharedEs from "./locales/shared/es.json"
import sharedFr from "./locales/shared/fr.json"
import sharedDe from "./locales/shared/de.json"
import sharedPtBR from "./locales/shared/pt-BR.json"
import sharedIt from "./locales/shared/it.json"
import sharedRu from "./locales/shared/ru.json"

export const sharedResources = {
  en: sharedEn,
  "zh-CN": sharedZhCN,
  "zh-Hant": sharedZhHant,
  ja: sharedJa,
  ko: sharedKo,
  es: sharedEs,
  fr: sharedFr,
  de: sharedDe,
  "pt-BR": sharedPtBR,
  it: sharedIt,
  ru: sharedRu,
} satisfies Record<SupportedLanguage, TranslationResource>
