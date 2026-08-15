import { showAlertWithStatusBarRestore } from "@/src/constants/alert-with-status-bar"
import i18n from "@/src/i18n"

type LibraryAddedPromptActions = {
  onStay: () => void
  onSwitch: () => void
}

/** Asks whether to stay or switch after a library is successfully added. */
export function promptLibraryAdded(
  name: string,
  { onStay, onSwitch }: LibraryAddedPromptActions,
): void {
  showAlertWithStatusBarRestore(
    i18n.t("notifications.libraryAdded", { name }),
    i18n.t("addLibrary.addedPrompt.detail", { name }),
    [
      {
        text: i18n.t("addLibrary.addedPrompt.stay"),
        style: "cancel",
        onPress: onStay,
      },
      {
        text: i18n.t("addLibrary.addedPrompt.switch"),
        isPreferred: true,
        onPress: onSwitch,
      },
    ],
  )
}

/** Lets the Settings navigation update commit before presenting the native prompt. */
export function promptLibraryAddedAfterNavigation(
  name: string,
  actions: LibraryAddedPromptActions,
): void {
  setTimeout(() => promptLibraryAdded(name, actions), 0)
}
