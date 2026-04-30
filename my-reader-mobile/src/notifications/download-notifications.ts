import { AppState } from "react-native";
import { Notifier } from "react-native-notifier";

import { InAppNotification } from "./in-app-notification";

type DownloadNotificationKind = "start" | "done" | "error";

let initialized = false;

/**
 * Marks the in-app notifier subsystem as initialized.
 */
export function initializeDownloadNotifications(): void {
  if (initialized) return;
  initialized = true;
}

/**
 * Sends an in-app banner notification for library refresh completion or failure.
 */
export function notifyLibraryRefresh(kind: "done" | "error", detail?: string): void {
  if (AppState.currentState !== "active") return;

  Notifier.showNotification({
    title: kind === "done" ? "书库已更新" : "书库更新失败",
    description: detail,
    duration: 2800,
    showAnimationDuration: 260,
    hideOnPress: true,
    Component: InAppNotification,
    componentProps: { kind: kind === "done" ? "success" : "error" },
  });
}

/**
 * Sends an in-app banner notification for download task state changes.
 */
export function notifyDownloadState(kind: DownloadNotificationKind, label: string, detail?: string): void {
  if (!initialized) return;
  if (AppState.currentState !== "active") return;

  const title = kind === "start" ? "开始下载" : kind === "done" ? "下载完成" : "下载失败";
  const notifKind = kind === "done" ? "success" : kind === "error" ? "error" : "info";

  Notifier.showNotification({
    title,
    description: detail ? `${label}\n${detail}` : label,
    duration: 2800,
    showAnimationDuration: 260,
    hideOnPress: true,
    Component: InAppNotification,
    componentProps: { kind: notifKind },
  });
}
