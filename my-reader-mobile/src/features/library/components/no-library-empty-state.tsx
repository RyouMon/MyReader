import { router } from "expo-router"
import { useTranslation } from "react-i18next"

import { EmptyState, PrimaryButton } from "@/src/components"
import { LIBRARY_EMPTY_STATE_ICON } from "@/src/components/ui/library-empty-state-icon"

export function NoLibraryEmptyState() {
  const { t } = useTranslation()

  return (
    <EmptyState
      title={t("addLibraryFlow.noLibrary.title")}
      detail={t("addLibraryFlow.noLibrary.description")}
      action={
        <PrimaryButton
          title={t("addLibraryFlow.title")}
          onPress={() => router.push("/settings/add-library")}
        />
      }
      icon={LIBRARY_EMPTY_STATE_ICON}
    />
  )
}
