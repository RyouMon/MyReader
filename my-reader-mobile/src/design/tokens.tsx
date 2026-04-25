import { useEffect, useMemo, type ReactNode } from "react";
import { setBackgroundColorAsync } from "expo-system-ui";
import { useColorScheme, type ColorSchemeName, type ColorValue } from "react-native";

import { getSemanticDestructiveColor, getSemanticOnDestructiveColor } from "./semantic-colors";
import { useAppStore } from "../store/app-store";
import { useThemeModeSetting } from "../store/settings-store";

export type ThemeMode = "system" | "light" | "dark";

export type ThemePalette = {
  background: string;
  backgroundSecondary: string;
  surface: string;
  text: string;
  textMuted: string;
  textOnPrimary: string;
  textOnDark: string;
  primary: string;
  secondary: string;
  primaryForeground: string;
  border: string;
  borderStrong: string;
  shadowSm: string;
  shadowMd: string;
  shadowLg: string;
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  error: string;
  danger: string;
  dangerSoft: string;
  destructive: ColorValue;
  onDestructive: ColorValue;
  overlay: string;
  overlayStrong: string;
};

type ThemeContextValue = {
  colorScheme: ColorSchemeName;
  mode: ThemeMode;
  palette: ThemePalette;
  setMode: (mode: ThemeMode) => void;
};

const APP_BORDER = {
  light: {
    default: "rgba(28, 23, 20, 0.10)",
    strong: "rgba(28, 23, 20, 0.20)",
  },
  dark: {
    default: "rgba(240, 235, 225, 0.10)",
    strong: "rgba(240, 235, 225, 0.20)",
  },
} as const;

const lightPaletteBase = {
  background: "#F7F3EC",
  backgroundSecondary: "#EDE8DF",
  surface: "#EDE8DF",
  text: "#1C1714",
  textMuted: "#5C5349",
  textOnPrimary: "#FAF6F0",
  textOnDark: "#FAF6F0",
  primary: "#D97757",
  secondary: "#A87E62",
  primaryForeground: "#FAF6F0",
  border: APP_BORDER.light.default,
  borderStrong: APP_BORDER.light.strong,
  shadowSm: "0 1px 3px rgba(28, 23, 20, 0.08)",
  shadowMd: "0 2px 8px  rgba(28, 23, 20, 0.10), 0 8px 24px rgba(28, 23, 20, 0.07)",
  shadowLg: "0 4px 16px rgba(28, 23, 20, 0.12), 0 24px 64px rgba(28, 23, 20, 0.14)",
  success: "#3A7D5A",
  successSoft: "rgba(58, 125, 90, 0.16)",
  warning: "#C4922D",
  warningSoft: "rgba(196, 146, 45, 0.16)",
  error: "#B53A2F",
  danger: "#B53A2F",
  dangerSoft: "rgba(181, 58, 47, 0.14)",
  overlay: "rgba(28,23,20,0.22)",
  overlayStrong: "rgba(28,23,20,0.50)",
} as const;

const lightPalette: ThemePalette = {
  ...lightPaletteBase,
  destructive: getSemanticDestructiveColor(),
  onDestructive: getSemanticOnDestructiveColor(),
};

const darkPaletteBase = {
  background: "#1C1814",
  backgroundSecondary: "#26211D",
  surface: "#26211D",
  text: "#F0EBE1",
  textMuted: "#B8AFA6",
  textOnPrimary: "#1C1714",
  textOnDark: "#1C1714",
  primary: "#C4602A",
  secondary: "#B8895A",
  primaryForeground: "#1C1714",
  border: APP_BORDER.dark.default,
  borderStrong: APP_BORDER.dark.strong,
  shadowSm: "0 1px 3px  rgba(0, 0, 0, 0.25)",
  shadowMd: "0 2px 8px  rgba(0, 0, 0, 0.32), 0 8px 24px rgba(0, 0, 0, 0.25)",
  shadowLg: "0 4px 16px rgba(0, 0, 0, 0.40), 0 24px 64px rgba(0, 0, 0, 0.35)",
  success: "#5AAD7E",
  successSoft: "rgba(90, 173, 126, 0.18)",
  warning: "#D4A844",
  warningSoft: "rgba(212, 168, 68, 0.18)",
  error: "#D46060",
  danger: "#D46060",
  dangerSoft: "rgba(212, 96, 96, 0.18)",
  overlay: "rgba(0,0,0,0.38)",
  overlayStrong: "rgba(0,0,0,0.65)",
} as const;

const darkPalette: ThemePalette = {
  ...darkPaletteBase,
  destructive: getSemanticDestructiveColor(),
  onDestructive: getSemanticOnDestructiveColor(),
};

/**
 * Returns the platform palette for the active color scheme.
 */
export function getThemePalette(colorScheme: ColorSchemeName) {
  return colorScheme === "dark" ? darkPalette : lightPalette;
}

/**
 * Resolves the persisted theme mode against the current system scheme.
 */
function resolveThemeMode(mode: ThemeMode, systemColorScheme: ColorSchemeName) {
  if (mode === "system") {
    return systemColorScheme ?? "light";
  }

  return mode;
}

/**
 * Initializes app theme side effects for React Native surfaces.
 */
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

/**
 * Returns the current theme mode, resolved color scheme, and palette.
 */
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

/**
 * Returns only the active semantic color palette.
 */
export function useThemePalette() {
  return useTheme().palette;
}

export { getSemanticDestructiveColor, getSemanticOnDestructiveColor } from "./semantic-colors";
