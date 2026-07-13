import type { AppLanguageMode } from "@/types/readerUiPreferences"

export type ResolvedAppLanguage = Exclude<AppLanguageMode, "system">

export function normalizeAppLanguageMode(value: unknown): AppLanguageMode {
  return value === "zh-CN" || value === "en" || value === "system"
    ? value
    : "system"
}

function resolveSystemLanguage(
  language: string | undefined,
): ResolvedAppLanguage {
  const normalized = language?.replace("_", "-").toLowerCase()
  if (normalized?.startsWith("en")) return "en"
  return "zh-CN"
}

export function getSystemAppLanguage(): ResolvedAppLanguage {
  if (typeof navigator === "undefined") return "zh-CN"
  return resolveSystemLanguage(navigator.language)
}

export function resolveAppLanguage(
  mode: AppLanguageMode,
  systemLanguage?: string,
): ResolvedAppLanguage {
  if (mode !== "system") return mode
  return systemLanguage === undefined
    ? getSystemAppLanguage()
    : resolveSystemLanguage(systemLanguage)
}
