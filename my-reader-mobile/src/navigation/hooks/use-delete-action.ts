import { useTranslation } from "react-i18next"
import {
  showAlertWithStatusBarRestore,
  showErrorAlert,
} from "@/src/constants/alert-with-status-bar"
import { errorMessage } from "@/src/i18n/error-message"
import { useThemePalette } from "@/src/design/tokens"
import type { ScreenHeaderAction } from "./use-screen-header"

export function useDeleteAction({
  name,
  onDelete,
  disabled,
  getDeleteDescription,
}: {
  name: string
  onDelete: () => void
  disabled?: boolean
  getDeleteDescription?: () => Promise<string>
}): ScreenHeaderAction {
  const { t } = useTranslation()
  const palette = useThemePalette()
  const confirm = (description?: string) =>
    showAlertWithStatusBarRestore(
      t("rowActions.confirmDelete", { name }),
      description,
      [
        { text: t("common.cancel"), style: "cancel" },
        { text: t("common.delete"), style: "destructive", onPress: onDelete },
      ],
    )
  return {
    label: t("rowActions.delete", { name }),
    iosSfSymbol: "trash",
    iconOnly: true,
    color: palette.danger,
    disabled,
    onPress: () => {
      if (!getDeleteDescription) {
        confirm()
        return
      }
      void getDeleteDescription()
        .then(confirm)
        .catch((error) =>
          showErrorAlert(t("rowActions.delete", { name }), errorMessage(error)),
        )
    },
  }
}
