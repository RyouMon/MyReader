import { useEffect, useState, type ReactNode } from "react"

import { changeLanguage, resolveAppLanguage } from "."
import { useAppStore } from "../store/app-store"

export function AppLanguageProvider({ children }: { children: ReactNode }) {
  const storeReady = useAppStore((state) => state.storeReady)
  const language = useAppStore((state) => state.settings.language)
  const [startupLanguageReady, setStartupLanguageReady] = useState(false)

  useEffect(() => {
    if (!storeReady || startupLanguageReady) {
      return
    }

    let cancelled = false

    void changeLanguage(resolveAppLanguage(language)).then(() => {
      if (!cancelled) {
        setStartupLanguageReady(true)
      }
    })

    return () => {
      cancelled = true
    }
  }, [language, startupLanguageReady, storeReady])

  return startupLanguageReady ? children : null
}
