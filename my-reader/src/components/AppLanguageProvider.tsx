import { type ReactNode, useLayoutEffect, useSyncExternalStore } from "react"
import i18n from "@/i18n"
import { getSystemAppLanguage, resolveAppLanguage } from "@/lib/appLanguage"
import { useAppUiStore } from "@/stores/appUiStore"

function subscribeSystemLanguage(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {}
  window.addEventListener("languagechange", onStoreChange)
  return () => window.removeEventListener("languagechange", onStoreChange)
}

export function AppLanguageProvider({ children }: { children: ReactNode }) {
  const languageMode = useAppUiStore((state) => state.appLanguageMode)
  const systemLanguage = useSyncExternalStore(
    subscribeSystemLanguage,
    getSystemAppLanguage,
    () => "zh-CN",
  )
  const language = resolveAppLanguage(languageMode, systemLanguage)

  useLayoutEffect(() => {
    document.documentElement.lang = language
    void i18n.changeLanguage(language)
  }, [language])

  return children
}
