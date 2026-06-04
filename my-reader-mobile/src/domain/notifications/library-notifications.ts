import { AppState } from "react-native";
import { Notifier } from "react-native-notifier";

import i18n from "@/src/i18n";
import { InAppNotification } from "./in-app-notification";

/** Shows an in-app banner when a library is successfully added. */
export function notifyLibraryAdded(name: string): void {
  if (AppState.currentState !== "active") return;

  Notifier.showNotification({
    title: i18n.t("notifications.libraryAdded", { name }),
    duration: 2800,
    showAnimationDuration: 260,
    hideOnPress: true,
    Component: InAppNotification,
    componentProps: { kind: "success" },
  });
}
