import { AppState, Appearance } from "react-native";
import { Notifier } from "react-native-notifier";

import { getThemePalette } from "../design/tokens";
import { useAppStore } from "../store/app-store";

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
 * Sends an in-app banner notification for download task state changes.
 */
export function notifyDownloadState(kind: DownloadNotificationKind, label: string, detail?: string): void {
  if (!initialized) return;
  if (AppState.currentState !== "active") return;

  const title = kind === "start" ? "开始下载" : kind === "done" ? "下载完成" : "下载失败";
  const body = detail ? `${label}\n${detail}` : label;
  const themeMode = useAppStore.getState().settings.themeMode;
  const resolvedColorScheme = (themeMode === "system" ? Appearance.getColorScheme() : themeMode) ?? "light";
  const palette = getThemePalette(resolvedColorScheme);
  const accentColor = kind === "done" ? palette.success : kind === "error" ? palette.error : palette.primary;

  Notifier.showNotification({
    title,
    description: body,
    duration: 2800,
    showAnimationDuration: 260,
    hideOnPress: true,
    componentProps: {
      containerStyle: {
        backgroundColor: palette.surface,
        borderColor: palette.border,
        borderWidth: 1,
        borderLeftColor: accentColor,
        borderLeftWidth: 3,
      },
      titleStyle: { fontWeight: "700", color: palette.text },
      descriptionStyle: { opacity: 0.9, color: palette.textMuted },
    },
  });
}
 