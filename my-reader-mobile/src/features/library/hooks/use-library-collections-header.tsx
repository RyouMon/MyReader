import CardsStackIcon from "@expo/material-symbols/cards_stack.xml"
import MoreVertIcon from "@expo/material-symbols/more_vert.xml"
import type { MenuComponentRef } from "@react-native-menu/menu"
import { type NativeStackNavigationOptions, router, Stack } from "expo-router"
import { type ReactNode, useCallback, useMemo, useRef } from "react"
import { useTranslation } from "react-i18next"
import { Platform } from "react-native"

import { AndroidHeaderIconButton } from "@/src/components/ui/android-header-icon-button"
import { AndroidHeaderSlot } from "@/src/components/ui/android-header-layout"
import { AndroidHeaderMenuButton } from "@/src/components/ui/android-header-menu-button"
import { useScreenHeader } from "@/src/navigation/hooks/use-screen-header"

type UseLibraryCollectionsHeaderParams = {
  selectedLibraryName?: string
  hasSelectedLibrary: boolean
  canImportBook: boolean
  onImportBook: () => void
  onSyncCurrentLibrary: () => void
}

type UseLibraryCollectionsHeaderResult = {
  options: NativeStackNavigationOptions
  toolbar: ReactNode
}

/** Keeps library-level actions on the collection root instead of book lists. */
export function useLibraryCollectionsHeader({
  selectedLibraryName,
  hasSelectedLibrary,
  canImportBook,
  onImportBook,
  onSyncCurrentLibrary,
}: UseLibraryCollectionsHeaderParams): UseLibraryCollectionsHeaderResult {
  const { t } = useTranslation()
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
      ...(hasSelectedLibrary
        ? [
            {
              id: "refreshLibrary",
              title: t("library.syncCurrentLibrary"),
            },
          ]
        : []),
      { id: "addLibrary", title: t("library.addLibrary") },
    ],
    [canImportBook, hasSelectedLibrary, t],
  )
  const handleAndroidMenuAction = useCallback(
    (event: string) => {
      if (event === "importBook") {
        onImportBook()
        return
      }
      if (event === "refreshLibrary") {
        onSyncCurrentLibrary()
        return
      }
      if (event === "addLibrary") {
        handleAddLibrary()
        return
      }
    },
    [handleAddLibrary, onImportBook, onSyncCurrentLibrary],
  )
  const { options: baseOptions, toolbar: baseToolbar } = useScreenHeader({
    title: selectedLibraryName ?? t("library.title"),
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
        <AndroidHeaderMenuButton
          menuRef={menuRef}
          actions={androidActions}
          onPressAction={handleAndroidMenuAction}
          icon={MoreVertIcon}
          accessibilityLabel={t("library.libraryActions")}
          side="right"
          anchoredToRight
        />
      ),
    }
  }, [
    androidActions,
    baseOptions,
    handleAndroidMenuAction,
    handleOpenLibrarySwitcher,
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
          <Stack.Toolbar.Menu icon="ellipsis">
            {canImportBook ? (
              <Stack.Toolbar.MenuAction
                icon="square.and.arrow.down"
                onPress={onImportBook}
              >
                {t("library.importBook")}
              </Stack.Toolbar.MenuAction>
            ) : null}
            {hasSelectedLibrary ? (
              <Stack.Toolbar.MenuAction
                icon="arrow.clockwise"
                onPress={onSyncCurrentLibrary}
              >
                {t("library.syncCurrentLibrary")}
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
    hasSelectedLibrary,
    onImportBook,
    onSyncCurrentLibrary,
    t,
  ])

  return { options, toolbar }
}
