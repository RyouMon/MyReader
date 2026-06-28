import { useTranslation } from "react-i18next"

import { EmptyState } from "@/src/components"

/** Shown while OneDrive OAuth finishes and the data source is being saved. */
export function OneDriveAddingEmptyState() {
  const { t } = useTranslation()

  return (
    <EmptyState
      title={t("onedrive.add.addingTitle")}
      detail={t("onedrive.add.addingDetail")}
      icon={{ ios: "hourglass", android: "hourglass-empty" }}
    />
  )
}
