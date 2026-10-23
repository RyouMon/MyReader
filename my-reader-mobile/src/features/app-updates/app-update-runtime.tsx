import { useEffect, useRef } from "react"
import { useTranslation } from "react-i18next"
import { AppState } from "react-native"
import { Notifier } from "react-native-notifier"
import { useAppUpdate } from "./use-app-update"

export function AppUpdateRuntime() {
  const { data, supported, check } = useAppUpdate()
  const { t } = useTranslation()
  const notified = useRef("")
  useEffect(() => {
    if (!supported) return
    const checkAutomatically = () => {
      if (AppState.currentState === "active") check(false)
    }
    checkAutomatically()
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") check(false)
    })
    const timer = setInterval(checkAutomatically, 60 * 60 * 1000)
    return () => {
      subscription.remove()
      clearInterval(timer)
    }
  }, [supported, check])
  useEffect(() => {
    if (!data?.version || !["available", "downloaded"].includes(data.status))
      return
    const key = `${data.version}:${data.status}`
    if (notified.current === key) return
    notified.current = key
    Notifier.showNotification({
      title: t("appUpdates.title"),
      description:
        data.status === "downloaded"
          ? t("appUpdates.status.downloaded", { version: data.version })
          : t("appUpdates.status.available", { version: data.version }),
    })
  }, [data, t])
  return null
}
