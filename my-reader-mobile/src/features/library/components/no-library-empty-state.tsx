import { router } from "expo-router"
import { useTranslation } from "react-i18next"

import { EmptyState, PrimaryButton } from "@/src/components"

export function NoLibraryEmptyState() {
  const { t } = useTranslation()

  return (
    <EmptyState
      title={t("home.noLibrary.title")}
      detail={t("home.noLibrary.detail")}
      action={
        <PrimaryButton
          title={t("library.addLibrary")}
          onPress={() => router.push("/settings/add-library")}
        />
      }
      icon={{ ios: "books.vertical.fill", android: "library-books" }}
    />
  )
}
