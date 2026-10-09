import { useEffect, useState, type ReactNode } from "react"
import { AppState } from "react-native"

import { changeLanguage, resolveAppLanguage } from "."
import { useAppStore } from "../store/app-store"

export function AppLanguageProvider({ children }: { children: ReactNode }) {
  const storeReady = useAppStore((state) => state.storeReady)
  const language = useAppStore((state) => state.settings.language)
  const [startupLanguageReady, setStartupLanguageReady] = useState(false)

  useEffect(() => {
    if (!storeReady) {
      return
    }

    let cancelled = false

    const applyLanguage = () => {
      void changeLanguage(resolveAppLanguage(language)).then(() => {
        if (!cancelled) setStartupLanguageReady(true)
      })
    }
    applyLanguage()
    const subscription =
      !language || language === "system"
        ? AppState.addEventListener("change", (state) => {
            if (state === "active") applyLanguage()
          })
        : undefined

    return () => {
      cancelled = true
      subscription?.remove()
    }
  }, [language, storeReady])

  return startupLanguageReady ? children : null
}
