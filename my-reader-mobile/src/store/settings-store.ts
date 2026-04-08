import { useMemo } from "react";

import { useAppStore } from "./app-store";

export function useSettingsStore() {
  const settings = useAppStore((state) => state.settings);
  const setThemeMode = useAppStore((state) => state.setThemeMode);
  const setSyncEnabled = useAppStore((state) => state.setSyncEnabled);

  return useMemo(
    () => ({
      settings,
      setThemeMode,
      setSyncEnabled,
    }),
    [settings, setThemeMode, setSyncEnabled]
  );
}

export function useThemeModeSetting() {
  const mode = useAppStore((state) => state.settings.themeMode);
  const setThemeMode = useAppStore((state) => state.setThemeMode);

  return useMemo(
    () => ({
      mode,
      setThemeMode,
    }),
    [mode, setThemeMode]
  );
}

export function useSyncSetting() {
  const syncEnabled = useAppStore((state) => state.settings.syncEnabled);
  const setSyncEnabled = useAppStore((state) => state.setSyncEnabled);

  return useMemo(
    () => ({
      syncEnabled,
      setSyncEnabled,
    }),
    [syncEnabled, setSyncEnabled]
  );
}
