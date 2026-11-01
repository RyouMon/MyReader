import { createContext, useContext, useEffect, useRef } from "react"
import { useTranslation } from "react-i18next"
import {
  ttsModelVoices,
  ttsUsageMessage,
  type TtsVoiceCatalog,
} from "@my-reader/tools/tts-selection-usage"
import { getTtsChangeUsage } from "@/src/services/core/tts"
import {
  showAlertWithStatusBarRestore,
  showErrorAlert,
} from "@/src/constants/alert-with-status-bar"
import { errorMessage } from "@/src/i18n/error-message"

type ConfirmRemoval = (
  provider: TtsVoiceCatalog,
  name?: string,
) => Promise<boolean>
export const TtsRemovalContext = createContext<ConfirmRemoval>(async () => true)
export const useTtsRemoval = () => useContext(TtsRemovalContext)

export function useTtsRemovalConfirmation() {
  const { t } = useTranslation()
  const accepted = useRef("")
  const active = useRef(true)
  const pending = useRef(false)
  const dismiss = useRef<(confirmed: boolean) => void>(undefined)
  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
      dismiss.current?.(false)
    }
  }, [])
  return async (provider: TtsVoiceCatalog, name?: string) => {
    if (!provider.id) return true
    if (pending.current) return false
    pending.current = true
    try {
      const usages = await getTtsChangeUsage(
        provider.id,
        ttsModelVoices(provider),
      )
      if (!active.current) return false
      const signature = JSON.stringify(usages)
      if (!usages.length || signature === accepted.current) return true
      const confirmed = await new Promise<boolean>((resolve) => {
        dismiss.current = resolve
        showAlertWithStatusBarRestore(
          name
            ? t("rowActions.confirmDelete", { name })
            : t("ttsRemoval.confirm"),
          ttsUsageMessage(usages, t),
          [
            {
              text: t("common.cancel"),
              style: "cancel",
              onPress: () => resolve(false),
            },
            {
              text: t("common.confirm"),
              style: "destructive",
              onPress: () => resolve(true),
            },
          ],
          { cancelable: true, onDismiss: () => resolve(false) },
        )
      })
      if (confirmed) accepted.current = signature
      return confirmed && active.current
    } catch (error) {
      if (active.current)
        showErrorAlert(t("settings.tts.saveFailed"), errorMessage(error))
      return false
    } finally {
      pending.current = false
      dismiss.current = undefined
    }
  }
}
