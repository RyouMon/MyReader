import { useEffect, useMemo, type ReactNode } from "react"
import { setBackgroundColorAsync } from "expo-system-ui"
import {
  useColorScheme,
  type ColorSchemeName,
  type ColorValue,
} from "react-native"

import {
  getSemanticDestructiveColor,
  getSemanticOnDestructiveColor,
} from "./semantic-colors"
import { useAppStore } from "../store/app-store"

export type ThemeMode = "system" | "light" | "dark"

export type ThemePalette = {
  background: string
  backgroundSecondary: string
  surface: string
  text: string
  textMuted: string
  textOnPrimary: string
  textOnDark: string
  primary: string
  secondary: string
  primaryForeground: string
  border: string
  borderStrong: string
  success: string
  successSoft: string
  warning: string
  warningSoft: string
  error: string
  danger: string
  dangerSoft: string
  brandOnedrive: string
  dataSourceWebdav: string
  destructive: ColorValue
  onDestructive: ColorValue
  overlay: string
  overlayStrong: string
}

type ThemeContextValue = {
  colorScheme: ColorSchemeName
  mode: ThemeMode
  palette: ThemePalette
  setMode: (mode: ThemeMode) => void
}

const APP_BORDER = {
  light: {
    default: "#ddd2c0",
    strong: "#d9cebb",
  },
  dark: {
    default: "rgba(245, 239, 230, 0.12)",
    strong: "rgba(245, 239, 230, 0.22)",
  },
} as const

const lightPaletteBase = {
  background: "#f5efe6",
  backgroundSecondary: "#f5efe6",
  surface: "#f0e8db",
  text: "#3b2f2f",
  textMuted: "#7a6b5d",
  textOnPrimary: "#faf5ef",
  textOnDark: "#faf5ef",
  primary: "#b5651d",
  secondary: "#A87E62",
  primaryForeground: "#faf5ef",
  border: APP_BORDER.light.default,
  borderStrong: APP_BORDER.light.strong,
  success: "#3A7D5A",
  successSoft: "rgba(58, 125, 90, 0.16)",
  warning: "#C4922D",
  warningSoft: "rgba(196, 146, 45, 0.16)",
  error: "#b44a3a",
  danger: "#b44a3a",
  dangerSoft: "rgba(180, 74, 58, 0.14)",
  brandOnedrive: "#0078d4",
  dataSourceWebdav: "#0f766e",
  overlay: "rgba(28,23,20,0.22)",
  overlayStrong: "rgba(28,23,20,0.50)",
} as const

const lightPalette: ThemePalette = {
  ...lightPaletteBase,
  destructive: getSemanticDestructiveColor(),
  onDestructive: getSemanticOnDestructiveColor(),
}

const darkPaletteBase = {
  background: "#1f1b17",
  backgroundSecondary: "#1f1b17",
  surface: "#2a2520",
  text: "#f5efe6",
  textMuted: "#b8afa6",
  textOnPrimary: "#3b2f2f",
  textOnDark: "#3b2f2f",
  primary: "#d4803a",
  secondary: "#B8895A",
  primaryForeground: "#3b2f2f",
  border: APP_BORDER.dark.default,
  borderStrong: APP_BORDER.dark.strong,
  success: "#5AAD7E",
  successSoft: "rgba(90, 173, 126, 0.18)",
  warning: "#D4A844",
  warningSoft: "rgba(212, 168, 68, 0.18)",
  error: "#d46a5a",
  danger: "#d46a5a",
  dangerSoft: "rgba(212, 106, 90, 0.18)",
  brandOnedrive: "#0078d4",
  dataSourceWebdav: "#5cc8be",
  overlay: "rgba(0,0,0,0.38)",
  overlayStrong: "rgba(0,0,0,0.65)",
} as const

const darkPalette: ThemePalette = {
  ...darkPaletteBase,
  destructive: getSemanticDestructiveColor(),
  onDestructive: getSemanticOnDestructiveColor(),
}

/**
 * Returns the platform palette for the active color scheme.
 */
export function getThemePalette(colorScheme: ColorSchemeName) {
  return colorScheme === "dark" ? darkPalette : lightPalette
}

/**
 * Resolves the persisted theme mode against the current system scheme.
 */
function resolveThemeMode(mode: ThemeMode, systemColorScheme: ColorSchemeName) {
  if (mode === "system") {
    return systemColorScheme ?? "light"
  }

  return mode
}

/**
 * Initializes app theme side effects for React Native surfaces.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemColorScheme = useColorScheme()
  const mode = useAppStore((s) => s.settings.themeMode)

  const colorScheme = resolveThemeMode(mode, systemColorScheme)
  const palette = useMemo(() => getThemePalette(colorScheme), [colorScheme])

  useEffect(() => {
    void setBackgroundColorAsync(palette.background)
  }, [palette.background])

  return children
}

/**
 * Returns the current theme mode, resolved color scheme, and palette.
 */
export function useTheme() {
  const systemColorScheme = useColorScheme()
  const mode = useAppStore((s) => s.settings.themeMode)
  const setThemeMode = useAppStore((s) => s.setThemeMode)
  const colorScheme = resolveThemeMode(mode, systemColorScheme)
  const palette = useMemo(() => getThemePalette(colorScheme), [colorScheme])

  return useMemo<ThemeContextValue>(
    () => ({
      colorScheme,
      mode,
      palette,
      setMode: setThemeMode,
    }),
    [colorScheme, mode, palette, setThemeMode],
  )
}

/**
 * Returns only the active semantic color palette.
 */
export function useThemePalette() {
  return useTheme().palette
}

export {
  getSemanticDestructiveColor,
  getSemanticOnDestructiveColor,
} from "./semantic-colors"
