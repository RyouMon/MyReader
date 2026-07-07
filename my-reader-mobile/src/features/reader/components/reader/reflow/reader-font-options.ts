import {
  coerceReaderFontOption,
  getReaderFontFamilyDeclarations,
  getReaderFontOptions as getSharedReaderFontOptions,
  isChineseReaderLanguage,
  normalizeReaderLanguage,
  primaryReaderLanguage,
  type ReaderFontFamilyKey,
  type ReaderFontOption,
  type ReaderFontSettings,
  readerFontLanguageKey,
  resolveReaderLanguage,
  resolveReaderFont as resolveSharedReaderFont,
  toReadiumFontFamily as toSharedReadiumFontFamily,
} from "@my-reader/fonts"
import type { FontFamilyDeclaration } from "@my-reader/readium"

export type { ReaderFontOption }

export const READER_FONT_DECLARATIONS: FontFamilyDeclaration[] =
  getReaderFontFamilyDeclarations("mobile")

export {
  coerceReaderFontOption,
  isChineseReaderLanguage,
  normalizeReaderLanguage,
  primaryReaderLanguage,
  readerFontLanguageKey,
  resolveReaderLanguage,
}

export function getReaderFontOptions(language: string | null | undefined) {
  return getSharedReaderFontOptions(language, "mobile")
}

export function resolveReaderFont(
  language: string | null | undefined,
  settings: ReaderFontSettings,
) {
  return resolveSharedReaderFont(language, settings, "mobile")
}

export function toReadiumFontFamily(fontFamily: ReaderFontFamilyKey) {
  return toSharedReadiumFontFamily(fontFamily, "mobile")
}
