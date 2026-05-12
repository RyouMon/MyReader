import { isTauri } from "@tauri-apps/api/core"
import { api } from "@/lib/tauri-api"
import { create } from "zustand"

import {
  DEFAULT_FIXED_LAYOUT_SETTINGS,
  DEFAULT_SETTINGS,
  type FixedLayoutSettings,
  type ReaderSettings,
} from "@/components/reader/types"
import { normalizeSpreadPreference } from "@/lib/readium/epubReaderPrefs"
import type {
  LibraryViewMode,
  ReaderUiPreferencesPayload,
} from "@/types/readerUiPreferences"

export interface ReflowablePreferencesSlice {
  settings: ReaderSettings
  tts: {
    ttsConfigId: string
    ttsSpeed: number
  }
}

export interface CachePreferencesSlice {
  maxCacheSizeMB: number
  autoCleanupOnLaunch: boolean
}

const DEFAULT_REFLOWABLE: ReflowablePreferencesSlice = {
  settings: DEFAULT_SETTINGS,
  tts: { ttsConfigId: "default", ttsSpeed: 1 },
}

let persistTimer: ReturnType<typeof setTimeout> | null = null

/** Returns whether a value is a supported persisted library view mode. */
function isLibraryViewMode(value: unknown): value is LibraryViewMode {
  return value === "grid" || value === "list"
}

function schedulePersistReaderPreferences(get: () => AppUiState) {
  if (!isTauri() || !get().readerPreferencesHydrated) return
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    persistTimer = null
    const s = get()
    const payload: ReaderUiPreferencesPayload = {
      version: 4,
      libraryViewMode: s.libraryViewMode,
      fixedLayout: s.fixedLayout,
      reflowable: s.reflowable,
      cache: s.cache,
    }
    console.info(
      `Start to persist reader UI preferences. version: ${payload.version}, theme: "${payload.reflowable.settings.theme}", font size: ${payload.reflowable.settings.fontSize}`,
    )
    void api.setReaderUiPreferences(payload)
      .then(() => {
        console.info("Success to persist reader UI preferences.")
      })
      .catch((e) => {
        console.error("Failed to persist reader UI preferences. error:", e)
      })
  }, 450)
}

export interface AppUiState {
  readerPreferencesHydrated: boolean
  libraryViewMode: LibraryViewMode
  fixedLayout: FixedLayoutSettings
  reflowable: ReflowablePreferencesSlice
  cache: CachePreferencesSlice
  setLibraryViewMode: (mode: LibraryViewMode) => void
  patchFixedLayout: (
    patch:
      | Partial<FixedLayoutSettings>
      | ((prev: FixedLayoutSettings) => FixedLayoutSettings),
  ) => void
  patchReflowableSettings: (patch: Partial<ReaderSettings>) => void
  patchReflowableTts: (
    patch: Partial<ReflowablePreferencesSlice["tts"]>,
  ) => void
  patchCacheSettings: (patch: Partial<CachePreferencesSlice>) => void
  hydrateReaderPreferences: (data: ReaderUiPreferencesPayload) => void
  markReaderPreferencesHydrated: () => void
}

export const useAppUiStore = create<AppUiState>()((set, get) => ({
  readerPreferencesHydrated: false,
  libraryViewMode: "grid",
  fixedLayout: { ...DEFAULT_FIXED_LAYOUT_SETTINGS },
  reflowable: {
    settings: { ...DEFAULT_REFLOWABLE.settings },
    tts: { ...DEFAULT_REFLOWABLE.tts },
  },
  cache: {
    maxCacheSizeMB: 2048,
    autoCleanupOnLaunch: true,
  },
  setLibraryViewMode: (mode) => {
    set({ libraryViewMode: mode })
    schedulePersistReaderPreferences(get)
  },
  patchFixedLayout: (patch) => {
    set((state) => ({
      fixedLayout:
        typeof patch === "function"
          ? patch(state.fixedLayout)
          : { ...state.fixedLayout, ...patch },
    }))
    schedulePersistReaderPreferences(get)
  },
  patchReflowableSettings: (patch) => {
    set((state) => ({
      reflowable: {
        ...state.reflowable,
        settings: { ...state.reflowable.settings, ...patch },
      },
    }))
    schedulePersistReaderPreferences(get)
  },
  patchReflowableTts: (patch) => {
    set((state) => ({
      reflowable: {
        ...state.reflowable,
        tts: { ...state.reflowable.tts, ...patch },
      },
    }))
    schedulePersistReaderPreferences(get)
  },
  patchCacheSettings: (patch) => {
    set((state) => ({
      cache: {
        ...state.cache,
        ...patch,
      },
    }))
    schedulePersistReaderPreferences(get)
  },
  hydrateReaderPreferences: (data) => {
    const rawTheme = data.reflowable?.settings?.theme as string | undefined
    const migratedTheme =
      rawTheme === "contrast3"
        ? "ocean"
        : rawTheme === "contrast4"
          ? "green"
          : rawTheme
    set({
      libraryViewMode: isLibraryViewMode(data.libraryViewMode)
        ? data.libraryViewMode
        : "grid",
      fixedLayout: {
        ...DEFAULT_FIXED_LAYOUT_SETTINGS,
        ...data.fixedLayout,
        spreadMode: normalizeSpreadPreference(data.fixedLayout?.spreadMode),
      },
      reflowable: {
        settings: {
          ...DEFAULT_SETTINGS,
          ...data.reflowable.settings,
          theme:
            (typeof migratedTheme === "string" ? migratedTheme : DEFAULT_SETTINGS.theme) as typeof DEFAULT_SETTINGS.theme,
        },
        tts: { ...DEFAULT_REFLOWABLE.tts, ...data.reflowable.tts },
      },
      cache: {
        maxCacheSizeMB: data.cache?.maxCacheSizeMB ?? 2048,
        autoCleanupOnLaunch: data.cache?.autoCleanupOnLaunch ?? true,
      },
    })
  },
  markReaderPreferencesHydrated: () => set({ readerPreferencesHydrated: true }),
}))
