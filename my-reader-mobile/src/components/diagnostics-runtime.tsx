import { useEffect } from "react"

import { applyDiagnosticsPreference } from "@/src/services/diagnostics/sentry"
import { useAppStore } from "@/src/store/app-store"

/** Starts or stops diagnostics only after the persisted preference is ready. */
export function DiagnosticsRuntime() {
  const storeReady = useAppStore((state) => state.storeReady)
  const diagnosticsEnabled = useAppStore(
    (state) => state.settings.diagnosticsEnabled,
  )

  useEffect(() => {
    if (!storeReady) {
      return
    }
    void applyDiagnosticsPreference(diagnosticsEnabled)
  }, [diagnosticsEnabled, storeReady])

  return null
}
