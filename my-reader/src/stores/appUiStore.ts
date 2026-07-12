import { isTauri } from "@tauri-apps/api/core"
import { create } from "zustand"
import {
  DEFAULT_FIXED_LAYOUT_SETTINGS,
  DEFAULT_SETTINGS,
  type FixedLayoutSettings,
  type ReaderSettings,
} from "@/components/reader/types"
import { normalizeSpreadPreference } from "@/lib/readium/epubReaderPrefs"
import {
  normalizeFixedBackground,
  normalizeFixedNavigationMode,
} from "@/lib/readium/fixedLayoutPreferences"
import {
  coerceReaderFontFamily,
  normalizeReaderFontFamiliesByLanguage,
} from "@/lib/readium/readerFonts"
import { api } from "@/lib/tauri-api"
import type {
  AppThemeMode,
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
let persistPromise: Promise<void> | null = null

/** Returns whether a value is a supported persisted library view mode. */
function isLibraryViewMode(value: unknown): value is LibraryViewMode {
  return value === "grid" || value === "list"
}

function isAppThemeMode(value: unknown): value is AppThemeMode {
  return value === "light" || value === "dark" || value === "system"
}

function readerPreferencesPayload(s: AppUiState): ReaderUiPreferencesPayload {
  return {
    version: 5,
    appTheme: s.appThemeMode,
    libraryViewMode: s.libraryViewMode,
    detailFullScreen: s.detailFullScreen,
    fixedLayout: s.fixedLayout,
    reflowable: s.reflowable,
    cache: s.cache,
  }
}

function persistReaderPreferences(get: () => AppUiState): Promise<void> {
  if (!isTauri() || !get().readerPreferencesHydrated) {
    return Promise.resolve()
  }
  const payload = readerPreferencesPayload(get())

  const run = async () => {
    console.info(
      `Start to persist reader UI preferences. version: ${payload.version}, theme: "${payload.reflowable.settings.theme}", font size: ${payload.reflowable.settings.fontSize}`,
    )
    try {
      await api.setReaderUiPreferences(payload)
      console.info("Success to persist reader UI preferences.")
    } catch (e) {
      console.error("Failed to persist reader UI preferences. error:", e)
    }
  }

  const previous = persistPromise ?? Promise.resolve()
  const next = previous.then(run, run)
  persistPromise = next
  void next.finally(() => {
    if (persistPromise === next) persistPromise = null
  })
  return next
}

function schedulePersistReaderPreferences(get: () => AppUiState) {
  if (!isTauri() || !get().readerPreferencesHydrated) return
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    persistTimer = null
    void persistReaderPreferences(get)
  }, 450)
}

function persistReaderPreferencesNow(get: () => AppUiState): Promise<void> {
  if (persistTimer) {
    clearTimeout(persistTimer)
    persistTimer = null
  }
  return persistReaderPreferences(get)
}

export interface AppUiState {
  readerPreferencesHydrated: boolean
  appThemeMode: AppThemeMode
  libraryViewMode: LibraryViewMode
  detailFullScreen: boolean
  fixedLayout: FixedLayoutSettings
  reflowable: ReflowablePreferencesSlice
  cache: CachePreferencesSlice
  setAppThemeMode: (mode: AppThemeMode) => void
  setLibraryViewMode: (mode: LibraryViewMode) => void
  setDetailFullScreen: (fullScreen: boolean) => void
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
  persistReaderPreferencesNow: () => Promise<void>
  hydrateReaderPreferences: (data: ReaderUiPreferencesPayload) => void
  markReaderPreferencesHydrated: () => void
}

export const useAppUiStore = create<AppUiState>()((set, get) => ({
  readerPreferencesHydrated: false,
  appThemeMode: "system",
  libraryViewMode: "grid",
  detailFullScreen: false,
  fixedLayout: { ...DEFAULT_FIXED_LAYOUT_SETTINGS },
  reflowable: {
    settings: { ...DEFAULT_REFLOWABLE.settings },
    tts: { ...DEFAULT_REFLOWABLE.tts },
  },
  cache: {
    maxCacheSizeMB: 2048,
    autoCleanupOnLaunch: true,
  },
  setAppThemeMode: (mode) => {
    set({ appThemeMode: mode })
    schedulePersistReaderPreferences(get)
  },
  setLibraryViewMode: (mode) => {
    set({ libraryViewMode: mode })
    schedulePersistReaderPreferences(get)
  },
  setDetailFullScreen: (fullScreen) => {
    set({ detailFullScreen: fullScreen })
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
  persistReaderPreferencesNow: () => persistReaderPreferencesNow(get),
  hydrateReaderPreferences: (data) => {
    const rawTheme = data.reflowable?.settings?.theme as string | undefined
    const rawSettings = data.reflowable?.settings
    const migratedTheme =
      rawTheme === "contrast3"
        ? "ocean"
        : rawTheme === "contrast4"
          ? "green"
          : rawTheme
    set({
      appThemeMode: isAppThemeMode(data.appTheme) ? data.appTheme : "system",
      libraryViewMode: isLibraryViewMode(data.libraryViewMode)
        ? data.libraryViewMode
        : "grid",
      detailFullScreen:
        typeof data.detailFullScreen === "boolean"
          ? data.detailFullScreen
          : false,
      fixedLayout: {
        ...DEFAULT_FIXED_LAYOUT_SETTINGS,
        ...data.fixedLayout,
        background: normalizeFixedBackground(data.fixedLayout?.background),
        navigationMode: normalizeFixedNavigationMode(
          data.fixedLayout?.navigationMode,
        ),
        spreadMode: normalizeSpreadPreference(data.fixedLayout?.spreadMode),
      },
      reflowable: {
        settings: {
          ...DEFAULT_SETTINGS,
          ...rawSettings,
          theme: (typeof migratedTheme === "string"
            ? migratedTheme
            : DEFAULT_SETTINGS.theme) as typeof DEFAULT_SETTINGS.theme,
          fontFamily: coerceReaderFontFamily(
            rawSettings?.fontFamily,
            "desktop",
          ),
          fontFamiliesByLanguage: normalizeReaderFontFamiliesByLanguage(
            rawSettings?.fontFamiliesByLanguage,
            "desktop",
          ),
        },
        tts: { ...DEFAULT_REFLOWABLE.tts, ...data.reflowable?.tts },
      },
      cache: {
        maxCacheSizeMB: data.cache?.maxCacheSizeMB ?? 2048,
        autoCleanupOnLaunch: data.cache?.autoCleanupOnLaunch ?? true,
      },
    })
  },
  markReaderPreferencesHydrated: () => set({ readerPreferencesHydrated: true }),
}))
