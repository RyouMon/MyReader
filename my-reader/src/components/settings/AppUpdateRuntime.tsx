import { useEffect, useRef } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { useAppUpdate } from "@/hooks/useAppUpdate"

export function AppUpdateRuntime() {
  const { data, supported, check } = useAppUpdate()
  const { t } = useTranslation()
  const notified = useRef("")
  useEffect(() => {
    if (!supported) return
    const checkAutomatically = () => check(false)
    checkAutomatically()
    window.addEventListener("focus", checkAutomatically)
    const timer = window.setInterval(checkAutomatically, 60 * 60 * 1000)
    return () => {
      window.removeEventListener("focus", checkAutomatically)
      window.clearInterval(timer)
    }
  }, [supported, check])
  useEffect(() => {
    if (!data?.version || !["available", "downloaded"].includes(data.status))
      return
    const key = `${data.version}:${data.status}`
    if (notified.current === key) return
    notified.current = key
    toast.info(
      data.status === "downloaded"
        ? t("appUpdates.status.downloaded", { version: data.version })
        : t("appUpdates.status.available", { version: data.version }),
    )
  }, [data, t])
  return null
}
