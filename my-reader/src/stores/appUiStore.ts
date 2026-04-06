import { invoke, isTauri } from "@tauri-apps/api/core"
import { create } from "zustand"

import {
  DEFAULT_FIXED_LAYOUT_SETTINGS,
  DEFAULT_SETTINGS,
  type FixedLayoutSettings,
  type ReaderSettings,
} from "@/components/reader/types"
import type { ReaderUiPreferencesPayload } from "@/types/readerUiPreferences"

export interface ReflowablePreferencesSlice {
  settings: ReaderSettings
  tts: {
    ttsConfigId: string
    ttsSpeed: number
  }
}

const DEFAULT_REFLOWABLE: ReflowablePreferencesSlice = {
  settings: DEFAULT_SETTINGS,
  tts: { ttsConfigId: "default", ttsSpeed: 1 },
}

let persistTimer: ReturnType<typeof setTimeout> | null = null

function schedulePersistReaderPreferences(get: () => AppUiState) {
  if (!isTauri() || !get().readerPreferencesHydrated) return
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    persistTimer = null
    const s = get()
    const payload: ReaderUiPreferencesPayload = {
      version: 1,
      fixedLayout: s.fixedLayout,
      reflowable: s.reflowable,
    }
    void invoke("set_reader_ui_preferences", { prefs: payload }).catch((e) => {
      console.error("Failed to save reader UI preferences", e)
    })
  }, 450)
}

export interface AppUiState {
  readerPreferencesHydrated: boolean
  fixedLayout: FixedLayoutSettings
  reflowable: ReflowablePreferencesSlice
  patchFixedLayout: (
    patch:
      | Partial<FixedLayoutSettings>
      | ((prev: FixedLayoutSettings) => FixedLayoutSettings),
  ) => void
  patchReflowableSettings: (patch: Partial<ReaderSettings>) => void
  patchReflowableTts: (
    patch: Partial<ReflowablePreferencesSlice["tts"]>,
  ) => void
  hydrateReaderPreferences: (data: ReaderUiPreferencesPayload) => void
  markReaderPreferencesHydrated: () => void
}

export const useAppUiStore = create<AppUiState>()((set, get) => ({
  readerPreferencesHydrated: false,
  fixedLayout: { ...DEFAULT_FIXED_LAYOUT_SETTINGS },
  reflowable: {
    settings: { ...DEFAULT_REFLOWABLE.settings },
    tts: { ...DEFAULT_REFLOWABLE.tts },
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
  hydrateReaderPreferences: (data) => {
    set({
      fixedLayout: { ...DEFAULT_FIXED_LAYOUT_SETTINGS, ...data.fixedLayout },
      reflowable: {
        settings: { ...DEFAULT_SETTINGS, ...data.reflowable.settings },
        tts: { ...DEFAULT_REFLOWABLE.tts, ...data.reflowable.tts },
      },
    })
  },
  markReaderPreferencesHydrated: () => set({ readerPreferencesHydrated: true }),
}))
