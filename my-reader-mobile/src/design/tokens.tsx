import { useEffect, useMemo, type ReactNode } from "react";
import { setBackgroundColorAsync } from "expo-system-ui";
import { useColorScheme, type ColorSchemeName, type ColorValue } from "react-native";

import { getSemanticDestructiveColor, getSemanticOnDestructiveColor } from "./semantic-colors";
import { useAppStore } from "../store/app-store";
import { useThemeModeSetting } from "../store/settings-store";

export type ThemeMode = "system" | "light" | "dark";

export type ThemePalette = {
  background: string;
  surface: string;
  surfaceMuted: string;
  text: string;
  textMuted: string;
  primary: string;
  primaryStrong: string;
  primaryForeground: string;
  border: string;
  success: string;
  warning: string;
  /** Inline validation / failure messages (theme-tinted, not necessarily system red). */
  error: string;
  /** Delete / irreversible controls; maps to system Material error red on native. */
  destructive: ColorValue;
  /** Text and icons on a solid `destructive` background. */
  onDestructive: ColorValue;
  overlay: string;
};

type ThemeContextValue = {
  colorScheme: ColorSchemeName;
  mode: ThemeMode;
  palette: ThemePalette;
  setMode: (mode: ThemeMode) => void;
};

const lightPaletteBase = {
  background: "#F7F3EC",
  surface: "#FFFDF8",
  surfaceMuted: "#F2ECE3",
  text: "#3B322B",
  textMuted: "#7D6F64",
  primary: "#A86A3A",
  primaryStrong: "#8D542B",
  primaryForeground: "#FFF9F2",
  border: "#E6DDD1",
  success: "#2F8F68",
  warning: "#B27A2A",
  error: "#B64A4A",
  overlay: "rgba(41, 31, 21, 0.22)",
} as const;

const lightPalette: ThemePalette = {
  ...lightPaletteBase,
  destructive: getSemanticDestructiveColor(),
  onDestructive: getSemanticOnDestructiveColor(),
};

const darkPaletteBase = {
  background: "#1C1916",
  surface: "#25211D",
  surfaceMuted: "#2E2823",
  text: "#EEE7DD",
  textMuted: "#B8AB9D",
  primary: "#C9874E",
  primaryStrong: "#D9985E",
  primaryForeground: "#1C1916",
  border: "#3A332D",
  success: "#55A884",
  warning: "#CF9A4F",
  error: "#CF6A6A",
  overlay: "rgba(0, 0, 0, 0.38)",
} as const;

const darkPalette: ThemePalette = {
  ...darkPaletteBase,
  destructive: getSemanticDestructiveColor(),
  onDestructive: getSemanticOnDestructiveColor(),
};

export function getThemePalette(colorScheme: ColorSchemeName) {
  return colorScheme === "dark" ? darkPalette : lightPalette;
}

function resolveThemeMode(mode: ThemeMode, systemColorScheme: ColorSchemeName) {
  if (mode === "system") {
    return systemColorScheme ?? "light";
  }

  return mode;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const initialize = useAppStore((state) => state.initialize);
  const hasHydrated = useAppStore((state) => state.hasHydrated);
  const systemColorScheme = useColorScheme();
  const { mode } = useThemeModeSetting();

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }

    void initialize();
  }, [hasHydrated, initialize]);

  const colorScheme = resolveThemeMode(mode, systemColorScheme);
  const palette = useMemo(() => getThemePalette(colorScheme), [colorScheme]);

  useEffect(() => {
    void setBackgroundColorAsync(palette.background);
  }, [palette.background]);

  return children;
}

export function useTheme() {
  const systemColorScheme = useColorScheme();
  const { mode, setThemeMode } = useThemeModeSetting();
  const colorScheme = resolveThemeMode(mode, systemColorScheme);
  const palette = useMemo(() => getThemePalette(colorScheme), [colorScheme]);

  return useMemo<ThemeContextValue>(
    () => ({
      colorScheme,
      mode,
      palette,
      setMode: setThemeMode,
    }),
    [colorScheme, mode, palette, setThemeMode]
  );
}

export function useThemePalette() {
  return useTheme().palette;
}

export { getSemanticDestructiveColor, getSemanticOnDestructiveColor } from "./semantic-colors";
