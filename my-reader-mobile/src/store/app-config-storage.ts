import type { StateStorage } from "zustand/middleware"

import {
  initializeAppConfig,
  writeMobileAppConfig,
  type AppConfigSnapshot,
} from "@/src/services/core/app-config"

type PersistedEnvelope = {
  state?: {
    settings?: Record<string, unknown>
    [key: string]: unknown
  }
  [key: string]: unknown
}

const emptyInitialConfig = {
  dataSources: [],
  libraries: [],
  activeLibraryId: null,
}

function parseEnvelope(value: string): PersistedEnvelope {
  const parsed: unknown = JSON.parse(value)
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("INVALID_MOBILE_CONFIG")
  }
  return parsed as PersistedEnvelope
}

function preferencesFromEnvelope(
  envelope: PersistedEnvelope,
): AppConfigSnapshot["preferences"] {
  const settings = envelope.state?.settings
  const theme = settings?.themeMode
  const language = settings?.language
  return {
    theme:
      theme === "light" || theme === "dark" || theme === "system"
        ? theme
        : "system",
    language:
      typeof language === "string" && language.length > 0 ? language : "system",
  }
}

function withoutCommonPreferences(envelope: PersistedEnvelope): string {
  const state = envelope.state
  const settings = state?.settings
  if (settings) {
    delete settings.themeMode
    delete settings.language
  }
  if (state) {
    delete state.dataSources
    delete state.libraries
    delete state.activeLibraryId
  }
  return JSON.stringify(envelope)
}

function withCommonPreferences(config: AppConfigSnapshot): string {
  const envelope = config.mobileJson
    ? parseEnvelope(config.mobileJson)
    : { state: {}, version: 0 }
  const state = envelope.state ?? {}
  const settings = state.settings ?? {}
  settings.themeMode = config.preferences.theme
  settings.language =
    config.preferences.language === "system" ? "" : config.preferences.language
  state.settings = settings
  state.dataSources = config.dataSources
  state.libraries = config.libraries
  state.activeLibraryId = config.activeLibraryId
  envelope.state = state
  return JSON.stringify(envelope)
}

export function createAppConfigStorage(): StateStorage {
  return {
    async getItem() {
      const config = await initializeAppConfig(emptyInitialConfig)
      return withCommonPreferences(config)
    },
    async setItem(_name, value) {
      const envelope = parseEnvelope(value)
      await writeMobileAppConfig(
        preferencesFromEnvelope(envelope),
        withoutCommonPreferences(envelope),
      )
    },
    async removeItem() {
      await writeMobileAppConfig(
        {
          theme: "system",
          language: "system",
        },
        null,
      )
    },
  }
}
