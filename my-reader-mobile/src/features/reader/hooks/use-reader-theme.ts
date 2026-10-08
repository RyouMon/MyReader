import { useEffect, useMemo, useRef } from "react"
import {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated"
import type { StatusBarStyle, ColorSchemeName } from "react-native"
import {
  readerChromePalette,
  type ReaderChromePalette,
} from "@/src/design/reader-chrome-palette"
import { READER_THEMES } from "@/src/design/reader-tokens"
import type {
  FixedReaderSettings,
  ReflowableReaderSettings,
  ReaderTheme,
} from "@/src/store/app-store.types"
import { READER_THEME_OPTIONS } from "../components/reader/chrome/readerChromeConstants"

export function useReaderTheme({
  formatParam,
  isReflowReady,
  loading,
  fixedSettings,
  reflowSettings,
  colorScheme,
}: {
  formatParam: string | undefined
  isReflowReady: boolean
  loading: boolean
  fixedSettings: FixedReaderSettings
  reflowSettings: ReflowableReaderSettings
  colorScheme: ColorSchemeName
}) {
  const isReflowFormatHint = formatParam?.toUpperCase() === "EPUB"
  const shouldUseReflowTheme = isReflowReady || (loading && isReflowFormatHint)
  const fixedBgColor =
    fixedSettings.background === "black"
      ? "#000000"
      : fixedSettings.background === "white"
        ? "#FFFFFF"
        : colorScheme === "dark"
          ? "#000000"
          : "#FFFFFF"
  const activeTheme: ReaderTheme = shouldUseReflowTheme
    ? reflowSettings.theme
    : fixedBgColor === "#000000"
      ? "night"
      : "neutral"
  const themeBgColor = shouldUseReflowTheme
    ? (READER_THEMES[activeTheme] ?? READER_THEMES.neutral).bg
    : fixedBgColor
  const themeFgColor = shouldUseReflowTheme
    ? (READER_THEMES[activeTheme] ?? READER_THEMES.neutral).fg
    : fixedBgColor === "#000000"
      ? "#D4CBC3"
      : "#2C2420"
  const isDarkTheme = activeTheme === "night" || activeTheme === "contrast2"
  const statusBarStyle: StatusBarStyle = isDarkTheme
    ? "light-content"
    : "dark-content"
  const themeBg = useSharedValue(themeBgColor)
  const themeOverlayOpacity = useSharedValue(0)
  const prevThemeBgRef = useRef(themeBgColor)
  useEffect(() => {
    if (prevThemeBgRef.current !== themeBgColor) {
      themeBg.value = prevThemeBgRef.current
      themeOverlayOpacity.value = 1
      themeOverlayOpacity.value = withTiming(0, { duration: 350 })
      themeBg.value = withTiming(themeBgColor, { duration: 350 })
      prevThemeBgRef.current = themeBgColor
    }
  }, [themeBgColor, themeBg, themeOverlayOpacity])
  const themeBgStyle = useAnimatedStyle(() => ({
    backgroundColor: themeBg.value,
  }))
  const themeOverlayStyle = useAnimatedStyle(() => ({
    backgroundColor: themeBg.value,
    opacity: themeOverlayOpacity.value,
  }))

  const chromePalette = useMemo<ReaderChromePalette>(() => {
    const option =
      READER_THEME_OPTIONS.find((o) => o.key === activeTheme) ??
      READER_THEME_OPTIONS[0]!
    return readerChromePalette(option.fg, option.swatch)
  }, [activeTheme])
  return {
    fixedBgColor,
    themeBgColor,
    themeFgColor,
    statusBarStyle,
    themeBgStyle,
    themeOverlayStyle,
    chromePalette,
  }
}
