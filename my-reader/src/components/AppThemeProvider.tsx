import {
  createContext,
  type ReactNode,
  useContext,
  useLayoutEffect,
  useMemo,
  useSyncExternalStore,
} from "react"
import {
  createTheme,
  StyledEngineProvider,
  ThemeProvider,
  type Components,
  type Theme,
} from "@mui/material/styles"
import GlobalStyles from "@mui/material/GlobalStyles"
import "@fontsource/roboto/400.css"
import "@fontsource/roboto/500.css"
import { useAppUiStore } from "@/stores/appUiStore"
import type {
  AppThemeMode,
  ResolvedAppTheme,
} from "@/types/readerUiPreferences"

const THEME_QUERY = "(prefers-color-scheme: dark)"
// Match Input's h-9 while keeping MUI's line height and horizontal padding.
const materialInputPadding = "calc((var(--spacing) * 9 - 1lh) / 2)"
const materialComponents: Components<Theme> = {
  MuiOutlinedInput: {
    styleOverrides: {
      root: ({ theme }) => ({
        backgroundColor:
          theme.palette.mode === "dark"
            ? "color-mix(in srgb, var(--input) 30%, transparent)"
            : "transparent",
        "&:hover:not(.Mui-focused):not(.Mui-error):not(.Mui-disabled) .MuiOutlinedInput-notchedOutline":
          {
            borderColor: "var(--border-strong)",
          },
      }),
      notchedOutline: { borderColor: "var(--input)" },
      input: {
        variants: [
          {
            props: { multiline: false },
            style: { paddingBlock: materialInputPadding },
          },
        ],
      },
    },
  },
  MuiInputLabel: {
    styleOverrides: {
      root: {
        variants: [
          {
            props: { variant: "outlined", shrink: false },
            style: {
              transform: `translate(14px, ${materialInputPadding}) scale(1)`,
            },
          },
        ],
      },
    },
  },
  MuiPaper: {
    styleOverrides: { root: { backgroundImage: "none" } },
  },
}

function createMaterialTheme(mode: ResolvedAppTheme) {
  return createTheme({
    cssVariables: { nativeColor: true, disableCssColorScheme: true },
    palette: {
      mode,
      primary: {
        main: "var(--primary)",
        contrastText: "var(--primary-foreground)",
      },
      secondary: {
        main: "var(--secondary)",
        contrastText: "var(--secondary-foreground)",
      },
      error: {
        main: "var(--danger)",
        contrastText: "var(--destructive-foreground)",
      },
      warning: { main: "var(--warning)", contrastText: "var(--ink-inverse)" },
      success: { main: "var(--success)", contrastText: "var(--ink-inverse)" },
      info: { main: "var(--secondary)", contrastText: "var(--ink-inverse)" },
      background: {
        default: "var(--background)",
        paper: "var(--popover)",
      },
      text: {
        primary: "var(--foreground)",
        secondary: "var(--muted-foreground)",
        disabled: "color-mix(in srgb, var(--foreground) 50%, transparent)",
      },
      divider: "var(--border)",
      action: {
        active: "var(--muted-foreground)",
        hover: "var(--accent)",
        selected: "var(--accent)",
        focus: "var(--accent)",
        disabled: "color-mix(in srgb, var(--foreground) 38%, transparent)",
        disabledBackground: "var(--muted)",
      },
    },
    components: materialComponents,
  })
}

const materialThemes = {
  light: createMaterialTheme("light"),
  dark: createMaterialTheme("dark"),
}

interface ThemeProviderState {
  theme: AppThemeMode
  resolvedTheme: ResolvedAppTheme
  setTheme: (theme: AppThemeMode) => void
}

const ThemeProviderContext = createContext<ThemeProviderState | null>(null)

function getSystemTheme(): ResolvedAppTheme {
  if (typeof window === "undefined" || !window.matchMedia) return "light"
  return window.matchMedia(THEME_QUERY).matches ? "dark" : "light"
}

function getServerTheme(): ResolvedAppTheme {
  return "light"
}

function subscribeSystemTheme(onStoreChange: () => void) {
  if (typeof window === "undefined" || !window.matchMedia) return () => {}
  const mediaQuery = window.matchMedia(THEME_QUERY)
  mediaQuery.addEventListener("change", onStoreChange)
  return () => mediaQuery.removeEventListener("change", onStoreChange)
}

function applyTheme(theme: ResolvedAppTheme) {
  document.documentElement.classList.remove("light", "dark")
  document.documentElement.classList.add(theme)
  document.documentElement.classList.toggle("dark", theme === "dark")
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
}

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const theme = useAppUiStore((s) => s.appThemeMode)
  const setTheme = useAppUiStore((s) => s.setAppThemeMode)
  const systemTheme = useSyncExternalStore(
    subscribeSystemTheme,
    getSystemTheme,
    getServerTheme,
  )
  const resolvedTheme = theme === "system" ? systemTheme : theme

  useLayoutEffect(() => {
    applyTheme(resolvedTheme)
  }, [resolvedTheme])

  const value = useMemo(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme],
  )

  return (
    <ThemeProviderContext.Provider value={value}>
      <StyledEngineProvider enableCssLayer>
        <GlobalStyles styles="@layer theme, base, mui, components, utilities;" />
        <ThemeProvider
          theme={materialThemes[resolvedTheme]}
          storageManager={null}
        >
          {children}
        </ThemeProvider>
      </StyledEngineProvider>
    </ThemeProviderContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeProviderContext)
  if (!context) {
    throw new Error("useTheme must be used within AppThemeProvider")
  }
  return context
}
