import { useNavigate } from "@tanstack/react-router"
import { isTauri } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import { useEffect } from "react"
import { OPEN_TTS_PROVIDERS_EVENT } from "@/lib/settingsWindow"

export function useSettingsWindowNavigation() {
  const navigate = useNavigate()
  useEffect(() => {
    if (!isTauri()) return
    const subscription = listen(OPEN_TTS_PROVIDERS_EVENT, () => {
      void navigate({ to: "/settings", search: { section: "ttsProviders" } })
    })
    return () => {
      void subscription.then((unlisten) => unlisten())
    }
  }, [navigate])
}
