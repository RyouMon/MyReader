import {
  createContext,
  type ReactNode,
  useContext,
  useLayoutEffect,
  useMemo,
  useSyncExternalStore,
} from "react"
import { useAppUiStore } from "@/stores/appUiStore"
import type {
  AppThemeMode,
  ResolvedAppTheme,
} from "@/types/readerUiPreferences"

const THEME_QUERY = "(prefers-color-scheme: dark)"

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
      {children}
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
