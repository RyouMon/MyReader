import { router, Stack, useLocalSearchParams } from "expo-router"
import { useTranslation } from "react-i18next"

import { EmptyState, PrimaryButton, Screen } from "@/src/components"
import { useThemePalette } from "@/src/design/tokens"
import { useAddOneDriveDataSource } from "@/src/features/onedrive/hooks/use-add-onedrive-data-source"
import { OneDriveAddingEmptyState } from "@/src/features/onedrive/onedrive-adding-empty-state"
import { useScreenHeader } from "@/src/navigation/hooks/use-screen-header"

function isAddLibraryFlow(from: string | undefined): boolean {
  return from === "add-library"
}

export default function OneDriveAddDataSourceScreen() {
  const { t } = useTranslation()
  const palette = useThemePalette()
  const { from, libraryAction, returnPath, returnToBrowser } =
    useLocalSearchParams<{
      from?: string
      libraryAction?: string
      returnPath?: string
      returnToBrowser?: string
    }>()
  const { addOneDriveDataSource, busy } = useAddOneDriveDataSource()

  function returnToNextStep(sourceId: string) {
    if (returnToBrowser === "true" || isAddLibraryFlow(from)) {
      router.replace({
        pathname: "/settings/add-library/browser",
        params: {
          dataSourceId: sourceId,
          sourceType: "onedrive",
          currentPath: returnPath ?? "/",
          libraryAction: libraryAction === "create" ? "create" : "open",
          ...(from ? { from } : {}),
        },
      })
      return
    }

    if (router.canGoBack()) {
      router.back()
    } else {
      router.replace("/settings/onedrive")
    }
  }

  async function handleAdd() {
    const source = await addOneDriveDataSource()
    if (source) returnToNextStep(source.id)
  }

  const { options, toolbar } = useScreenHeader({
    title: t("onedrive.add.signInTitle"),
    backTitle: t("back"),
  })

  return (
    <>
      <Stack.Screen options={options} />
      {toolbar}
      <Screen>
        {busy ? (
          <OneDriveAddingEmptyState />
        ) : (
          <EmptyState
            title={t("onedrive.add.signInTitle")}
            detail={t("onedrive.add.signInDetail")}
            action={
              <PrimaryButton
                title={t("onedrive.add.signInWithMicrosoft")}
                onPress={() => void handleAdd()}
              />
            }
            icon={{
              ios: "cloud.fill",
              android: "cloud",
              tone: "onedrive",
            }}
            colors={{
              icon: palette.brandOnedrive,
              title: palette.text,
              detail: palette.textMuted,
            }}
          />
        )}
      </Screen>
    </>
  )
}
