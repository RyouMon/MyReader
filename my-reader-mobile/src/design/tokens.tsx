import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { setBackgroundColorAsync } from "expo-system-ui";
import { useColorScheme, type ColorSchemeName } from "react-native";

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
  error: string;
  overlay: string;
};

type ThemeContextValue = {
  colorScheme: ColorSchemeName;
  mode: ThemeMode;
  palette: ThemePalette;
  setMode: (mode: ThemeMode) => void;
};

const lightPalette: ThemePalette = {
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
};

const darkPalette: ThemePalette = {
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

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemColorScheme = useColorScheme();
  const [mode, setMode] = useState<ThemeMode>("system");

  const colorScheme = resolveThemeMode(mode, systemColorScheme);
  const palette = useMemo(() => getThemePalette(colorScheme), [colorScheme]);

  useEffect(() => {
    void setBackgroundColorAsync(palette.background);
  }, [palette.background]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      colorScheme,
      mode,
      palette,
      setMode,
    }),
    [colorScheme, mode, palette]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }

  return context;
}

export function useThemePalette() {
  return useTheme().palette;
}
