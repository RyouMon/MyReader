import CardsStackIcon from "@expo/material-symbols/cards_stack.xml"
import MoreVertIcon from "@expo/material-symbols/more_vert.xml"
import type { MenuComponentRef } from "@react-native-menu/menu"
import { type NativeStackNavigationOptions, router, Stack } from "expo-router"
import { type ReactNode, useCallback, useMemo, useRef } from "react"
import { useTranslation } from "react-i18next"
import { Platform, View } from "react-native"

import { AndroidHeaderIconButton } from "@/src/components/ui/android-header-icon-button"
import { AndroidHeaderSlot } from "@/src/components/ui/android-header-layout"
import { AndroidHeaderMenuButton } from "@/src/components/ui/android-header-menu-button"
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

/** Keeps library-level actions on the collection root instead of book lists. */
export function useLibraryCollectionsHeader({
  selectedLibraryName,
  canImportBook,
  onImportBook,
}: UseLibraryCollectionsHeaderParams): UseLibraryCollectionsHeaderResult {
  const { t } = useTranslation()
  const syncAction = useSyncStatusHeaderAction()
  const menuRef = useRef<MenuComponentRef>(null)
  const handleAddLibrary = useCallback(
    () => router.push("/settings/add-library"),
    [],
  )
  const handleOpenLibrarySwitcher = useCallback(
    () => router.push("/switch-library"),
    [],
  )
  const androidActions = useMemo(
    () => [
      ...(canImportBook
        ? [{ id: "importBook", title: t("library.importBook") }]
        : []),
      { id: "addLibrary", title: t("library.addLibrary") },
    ],
    [canImportBook, t],
  )
  const handleAndroidMenuAction = useCallback(
    (event: string) => {
      if (event === "importBook") {
        onImportBook()
        return
      }
      if (event === "addLibrary") {
        handleAddLibrary()
        return
      }
    },
    [handleAddLibrary, onImportBook],
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
          <AndroidHeaderMenuButton
            menuRef={menuRef}
            actions={androidActions}
            onPressAction={handleAndroidMenuAction}
            icon={MoreVertIcon}
            accessibilityLabel={t("library.libraryActions")}
            side="right"
            anchoredToRight
          />
        </View>
      ),
    }
  }, [
    androidActions,
    baseOptions,
    handleAndroidMenuAction,
    handleOpenLibrarySwitcher,
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
          <Stack.Toolbar.Menu icon="ellipsis">
            {canImportBook ? (
              <Stack.Toolbar.MenuAction
                icon="square.and.arrow.down"
                onPress={onImportBook}
              >
                {t("library.importBook")}
              </Stack.Toolbar.MenuAction>
            ) : null}
            <Stack.Toolbar.MenuAction icon="plus" onPress={handleAddLibrary}>
              {t("library.addLibrary")}
            </Stack.Toolbar.MenuAction>
          </Stack.Toolbar.Menu>
        </Stack.Toolbar>
      </>
    )
  }, [
    baseToolbar,
    canImportBook,
    handleAddLibrary,
    handleOpenLibrarySwitcher,
    onImportBook,
    syncAction,
    t,
  ])

  return { options, toolbar }
}
