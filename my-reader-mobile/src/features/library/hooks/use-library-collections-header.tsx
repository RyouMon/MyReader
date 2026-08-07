import CardsStackIcon from "@expo/material-symbols/cards_stack.xml"
import DownloadIcon from "@expo/material-symbols/download.xml"
import { type NativeStackNavigationOptions, router, Stack } from "expo-router"
import { type ReactNode, useCallback, useMemo } from "react"
import { useTranslation } from "react-i18next"
import { Platform, View } from "react-native"

import { AndroidHeaderIconButton } from "@/src/components/ui/android-header-icon-button"
import { AndroidHeaderSlot } from "@/src/components/ui/android-header-layout"
import { renderHeaderToolbarActions } from "@/src/components/ui/header-toolbar.android"
import { useSyncStatusHeaderAction } from "@/src/features/sync/hooks/use-sync-status-header-action"
import { useScreenHeader } from "@/src/navigation/hooks/use-screen-header"

type UseLibraryCollectionsHeaderParams = {
  selectedLibraryName?: string
  canImportBook: boolean
  onImportBook: () => void
}

type UseLibraryCollectionsHeaderResult = {
  options: NativeStackNavigationOptions
  toolbar: ReactNode
}

/** Keeps library-level actions visible on the collection root. */
export function useLibraryCollectionsHeader({
  selectedLibraryName,
  canImportBook,
  onImportBook,
}: UseLibraryCollectionsHeaderParams): UseLibraryCollectionsHeaderResult {
  const { t } = useTranslation()
  const syncAction = useSyncStatusHeaderAction()
  const handleOpenLibrarySwitcher = useCallback(
    () => router.push("/switch-library"),
    [],
  )
  const { options: baseOptions, toolbar: baseToolbar } = useScreenHeader({
    title: selectedLibraryName ?? t("library.label"),
    headerLargeTitle: true,
  })

  const options = useMemo((): NativeStackNavigationOptions => {
    if (Platform.OS !== "android") return baseOptions
    return {
      ...baseOptions,
      headerTitleAlign: "center",
      headerLeft: () => (
        <AndroidHeaderSlot side="left">
          <AndroidHeaderIconButton
            accessibilityLabel={t("library.allLibraries")}
            icon={CardsStackIcon}
            onPress={handleOpenLibrarySwitcher}
            testID="library-switcher-button"
          />
        </AndroidHeaderSlot>
      ),
      headerRight: () => (
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          {renderHeaderToolbarActions([syncAction])}
          {canImportBook ? (
            <AndroidHeaderIconButton
              accessibilityLabel={t("library.importBook")}
              icon={DownloadIcon}
              onPress={onImportBook}
              testID="library-import-book-button"
            />
          ) : null}
        </View>
      ),
    }
  }, [
    baseOptions,
    canImportBook,
    handleOpenLibrarySwitcher,
    onImportBook,
    syncAction,
    t,
  ])

  const toolbar = useMemo((): ReactNode => {
    if (Platform.OS !== "ios") return baseToolbar
    return (
      <>
        <Stack.Toolbar placement="left">
          <Stack.Toolbar.Button
            accessibilityLabel={t("library.allLibraries")}
            onPress={handleOpenLibrarySwitcher}
          >
            {t("library.allLibraries")}
          </Stack.Toolbar.Button>
        </Stack.Toolbar>
        <Stack.Toolbar placement="right">
          {syncAction.iosSfSymbol ? (
            <Stack.Toolbar.Button
              accessibilityLabel={syncAction.label}
              onPress={syncAction.onPress}
              tintColor={syncAction.color}
            >
              <Stack.Toolbar.Icon sf={syncAction.iosSfSymbol} />
            </Stack.Toolbar.Button>
          ) : null}
          {canImportBook ? (
            <Stack.Toolbar.Button
              accessibilityLabel={t("library.importBook")}
              onPress={onImportBook}
            >
              <Stack.Toolbar.Icon sf="square.and.arrow.down" />
            </Stack.Toolbar.Button>
          ) : null}
        </Stack.Toolbar>
      </>
    )
  }, [
    baseToolbar,
    canImportBook,
    handleOpenLibrarySwitcher,
    onImportBook,
    syncAction,
    t,
  ])

  return { options, toolbar }
}
