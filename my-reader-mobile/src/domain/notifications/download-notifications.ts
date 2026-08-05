import { AppState } from "react-native"
import { Notifier } from "react-native-notifier"

import { showAlertWithStatusBarRestore } from "@/src/constants/alert-with-status-bar"
import { describeDownloadError } from "@/src/errors/app-errors"
import i18n from "@/src/i18n"
import { InAppNotification } from "./in-app-notification"

type DownloadNotificationKind = "start" | "done" | "error"

let initialized = false

/**
 * Marks the in-app notifier subsystem as initialized.
 */
export function initializeDownloadNotifications(): void {
  if (initialized) return
  initialized = true
}

/**
 * Sends an in-app banner notification for library refresh completion or failure.
 */
export function notifyLibraryRefresh(
  kind: "done" | "error",
  detail?: string,
): void {
  if (AppState.currentState !== "active") return

  Notifier.showNotification({
    title:
      kind === "done"
        ? i18n.t("notifications.libraryUpdated")
        : i18n.t("notifications.libraryUpdateFailed"),
    description: detail,
    duration: 2800,
    showAnimationDuration: 260,
    hideOnPress: true,
    Component: InAppNotification,
    componentProps: { kind: kind === "done" ? "success" : "error" },
  })
}

/**
 * Sends an in-app banner notification for download task state changes.
 */
export function notifyDownloadState(
  kind: DownloadNotificationKind,
  label: string,
  detail?: string,
): void {
  if (!initialized) return
  if (AppState.currentState !== "active") return

  if (kind === "error") {
    const error = describeDownloadError(detail ?? label)
    showAlertWithStatusBarRestore(
      error.title,
      detail ? `${label}\n${error.message}` : error.message,
    )
    return
  }

  const title =
    kind === "start"
      ? i18n.t("notifications.downloadStart")
      : i18n.t("notifications.downloadDone")
  const notifKind = kind === "done" ? "success" : "info"

  Notifier.showNotification({
    title,
    description: detail ? `${label}\n${detail}` : label,
    duration: 2800,
    showAnimationDuration: 260,
    hideOnPress: true,
    Component: InAppNotification,
    componentProps: { kind: notifKind },
  })
}
