import {
  FALLBACK_LANGUAGE,
  matchLanguage,
  resolveLanguage,
} from "@my-reader/i18n/languages"
import type { AppLanguageMode } from "@/types/readerUiPreferences"

export type ResolvedAppLanguage = Exclude<AppLanguageMode, "system">

export function normalizeAppLanguageMode(value: unknown): AppLanguageMode {
  return typeof value === "string"
    ? (matchLanguage(value) ?? "system")
    : "system"
}

export function getSystemAppLanguage(): ResolvedAppLanguage {
  if (typeof navigator === "undefined") return FALLBACK_LANGUAGE
  return resolveLanguage(
    navigator.languages?.length ? navigator.languages : [navigator.language],
  )
}

export function resolveAppLanguage(
  mode: AppLanguageMode,
  systemLanguage?: string,
): ResolvedAppLanguage {
  if (mode !== "system") return mode
  return systemLanguage === undefined
    ? getSystemAppLanguage()
    : resolveLanguage([systemLanguage])
}
