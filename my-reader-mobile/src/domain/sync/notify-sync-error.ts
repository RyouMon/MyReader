import { appendErrorDetail, syncFailureKeys } from "@my-reader/i18n/mobile"
import { Notifier } from "react-native-notifier"
import { InAppNotification } from "@/src/domain/notifications/in-app-notification"
import i18n from "@/src/i18n"
import { classifySyncFailure } from "./failure"

/** Background sync only interrupts for failures that need the user's attention. */
export function notifySyncError(error: unknown, label: string): void {
  console.warn(`[SyncRuntime] ${label} sync failed`, error)
  const kind = classifySyncFailure(error)
  if (
    kind !== "configuration" &&
    kind !== "credential" &&
    kind !== "data_integrity"
  ) {
    return
  }
  const keys = syncFailureKeys(kind)
  Notifier.showNotification({
    title: i18n.t(keys.title),
    description: appendErrorDetail(i18n.t(keys.detail), error),
    duration: 6000,
    hideOnPress: true,
    Component: InAppNotification,
    componentProps: { kind: "error" },
  })
}
