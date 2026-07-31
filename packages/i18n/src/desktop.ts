import { desktopEn } from "./locales/desktop/en"
import { desktopZhCN } from "./locales/desktop/zh-CN"
import { sharedEn } from "./locales/shared/en"
import { sharedZhCN } from "./locales/shared/zh-CN"
import { mergeTranslationResources } from "./merge-resources"
import type { TranslationKey } from "./translation-key"

export type { SupportedLanguage } from "./languages"
export { SUPPORTED_LANGUAGES } from "./languages"

const desktopEnTranslation = mergeTranslationResources(
  sharedEn,
  desktopEn.translation,
)
const desktopZhCNTranslation = mergeTranslationResources(
  sharedZhCN,
  desktopZhCN.translation,
)

export const desktopResources = {
  "zh-CN": { translation: desktopZhCNTranslation },
  en: { translation: desktopEnTranslation },
} as const

export type DesktopTranslationKey = TranslationKey<typeof desktopEnTranslation>
