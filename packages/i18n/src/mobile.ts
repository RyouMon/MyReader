import mobileEn from "./locales/mobile/en.json"
import mobileZhCN from "./locales/mobile/zh-CN.json"
import { sharedEn } from "./locales/shared/en"
import { sharedZhCN } from "./locales/shared/zh-CN"
import { mergeTranslationResources } from "./merge-resources"
import type { TranslationKey } from "./translation-key"

export type { SupportedLanguage } from "./languages"
export { SUPPORTED_LANGUAGES } from "./languages"

const mobileEnTranslation = mergeTranslationResources(sharedEn, mobileEn)
const mobileZhCNTranslation = mergeTranslationResources(sharedZhCN, mobileZhCN)

export const mobileResources = {
  "zh-CN": { translation: mobileZhCNTranslation },
  en: { translation: mobileEnTranslation },
} as const

export type MobileTranslationKey = TranslationKey<typeof mobileEnTranslation>
