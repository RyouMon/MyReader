import type { AppState, AppStateSlice } from "./app-store.types";
import { defaultSettings } from "./app-store.constants";

type SettingsSlice = Pick<AppState, "settings" | "setThemeMode" | "setSyncEnabled">;

export const createSettingsSlice: AppStateSlice<SettingsSlice> = (set) => ({
  settings: defaultSettings,
  setThemeMode(mode) {
    set((state) => ({ settings: { ...state.settings, themeMode: mode } }));
  },
  setSyncEnabled(enabled) {
    set((state) => ({ settings: { ...state.settings, syncEnabled: enabled } }));
  },
});
