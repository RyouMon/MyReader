import { useTranslation } from "react-i18next"
import { showAlertWithStatusBarRestore } from "@/src/constants/alert-with-status-bar"
import { useThemePalette } from "@/src/design/tokens"
import type { ScreenHeaderAction } from "./use-screen-header"

export function useDeleteAction({
  name,
  onDelete,
  disabled,
}: {
  name: string
  onDelete: () => void
  disabled?: boolean
}): ScreenHeaderAction {
  const { t } = useTranslation()
  const palette = useThemePalette()
  return {
    label: t("rowActions.delete", { name }),
    iosSfSymbol: "trash",
    iconOnly: true,
    color: palette.danger,
    disabled,
    onPress: () =>
      showAlertWithStatusBarRestore(
        t("rowActions.confirmDelete", { name }),
        undefined,
        [
          { text: t("common.cancel"), style: "cancel" },
          { text: t("common.delete"), style: "destructive", onPress: onDelete },
        ],
      ),
  }
}
