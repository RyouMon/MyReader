import { useEffect, useMemo, type ReactNode } from "react";
import { setBackgroundColorAsync } from "expo-system-ui";
import { useColorScheme, type ColorSchemeName, type ColorValue } from "react-native";

import { getSemanticDestructiveColor, getSemanticOnDestructiveColor } from "./semantic-colors";
import { useAppStore } from "../store/app-store";
import { useThemeModeSetting } from "../store/settings-store";

export type ThemeMode = "system" | "light" | "dark";

export type ThemePalette = {
  /* ── Base surfaces ── */
  background: string;
  surface: string;
  /** Slightly recessed — secondary panels, recessed rows. */
  surfaceMuted: string;
  /** surface-2 equivalent: in-panel row alternation, hover backgrounds. */
  surface2: string;
  /** surface-3 equivalent: pressed / selected state backgrounds. */
  surface3: string;

  /* ── Ink / text hierarchy ── */
  text: string;
  textMuted: string;
  /** Tertiary — disabled, placeholder, decorative. */
  textSubtle: string;
  /** Ghost — faintest readable text. */
  textGhost: string;
  /** Text/icons on dark or accent surfaces. */
  textOnDark: string;

  /* ── Accent / primary ── */
  primary: string;
  primaryStrong: string;
  primaryForeground: string;
  /** Tinted accent background for badges, selected rows. */
  accentSoft: string;
  /** Accent-tinted border or divider. */
  accentMuted: string;

  /* ── Border ── */
  border: string;

  /* ── Semantic feedback ── */
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  /** Inline validation / failure messages (theme-tinted, not necessarily system red). */
  error: string;
  dangerSoft: string;
  /** Delete / irreversible controls; maps to system Material error red on native. */
  destructive: ColorValue;
  /** Text and icons on a solid `destructive` background. */
  onDestructive: ColorValue;

  /* ── Overlay ── */
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
    subtle: "rgba(28, 23, 20, 0.06)",
    default: "rgba(28, 23, 20, 0.10)",
    strong: "rgba(28, 23, 20, 0.18)",
    active: "rgba(196, 98, 45, 0.22)",
    error: "rgba(181, 58, 47, 0.18)",
  },
  dark: {
    subtle: "rgba(240, 235, 225, 0.08)",
    default: "rgba(240, 235, 225, 0.12)",
    strong: "rgba(240, 235, 225, 0.18)",
    active: "rgba(212, 112, 58, 0.22)",
    error: "rgba(207, 106, 106, 0.20)",

  },
} as const;

const lightPaletteBase = {
  background: "#F7F3EC",
  surface: "#FFFFFF",
  surfaceMuted: "#F5F1EA",
  surface2: "#F5F1EA",
  surface3: "#EDE8DF",
  text: "#1C1714",
  textMuted: "#5C5349",
  textSubtle: "#9C9089",
  textGhost: "#C4B8AE",
  textOnDark: "#FAF6F0",
  primary: "#C4622D",
  primaryStrong: "#B05523",
  primaryForeground: "#FAF6F0",
  accentSoft: "#F5E8DF",
  accentMuted: "#E8C9B5",
  border: APP_BORDER.light.default,
  success: "#3A7D5A",
  successSoft: "#C2DDD0",
  warning: "#C4922D",
  warningSoft: "#E8C87A",
  error: "#B53A2F",
  dangerSoft: "#DFA8A4",
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
  surface: "#26211D",
  surfaceMuted: "#2F2923",
  surface2: "#2F2923",
  surface3: "#382F27",
  text: "#F0EBE1",
  textMuted: "#B8AFA6",
  textSubtle: "#7A7068",
  textGhost: "#5A5048",
  textOnDark: "#1C1714",
  primary: "#D4703A",
  primaryStrong: "#B05523",
  primaryForeground: "#1C1714",
  accentSoft: "#3A2218",
  accentMuted: "#5A3020",
  border: APP_BORDER.dark.default,
  success: "#55A884",
  successSoft: "#1E3D2E",
  warning: "#CF9A4F",
  warningSoft: "#3A2E12",
  error: "#CF6A6A",
  dangerSoft: "#3D1E1E",
  overlay: "rgba(0,0,0,0.38)",
  overlayStrong: "rgba(0,0,0,0.65)",
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
