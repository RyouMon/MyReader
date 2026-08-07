import TuneIcon from "@expo/material-symbols/tune.xml"
import type { BuiltInBookCollectionId } from "@my-reader/tools/types/book-collection"
import type { MenuComponentRef } from "@react-native-menu/menu"
import type { NativeStackNavigationOptions } from "expo-router"
import { type RefObject, useCallback, useMemo } from "react"
import { useTranslation } from "react-i18next"

import { AndroidHeaderMenuButton } from "@/src/components/ui/android-header-menu-button"
import { renderHeaderToolbarActions } from "@/src/components/ui/header-toolbar.android"
import type { SortOption } from "@/src/features/library/hooks/use-books-for-collection"
import type { ScreenHeaderAction } from "@/src/navigation/hooks/use-screen-header"
import type { LibraryViewMode } from "@/src/store/app-store.types"
import { View } from "@/tw"

import {
  getLibrarySortOptions,
  libraryViewOptions,
} from "../utils/library-header-config"

type UseLibraryAndroidHeaderMenuOptionsParams = {
  rightMenuRef: RefObject<MenuComponentRef | null>
  collectionId: BuiltInBookCollectionId
  sortBy: SortOption
  viewMode: LibraryViewMode
  syncAction: ScreenHeaderAction
  onSetSortBy: (value: SortOption) => void
  onSetViewMode: (value: LibraryViewMode) => void
}

/** Builds the Android book-list menu without replacing the stack back button. */
export function useLibraryAndroidHeaderMenuOptions({
  rightMenuRef,
  collectionId,
  sortBy,
  viewMode,
  syncAction,
  onSetSortBy,
  onSetViewMode,
}: UseLibraryAndroidHeaderMenuOptionsParams): Pick<
  NativeStackNavigationOptions,
  "headerRight"
> {
  const { t } = useTranslation()
  const sortOptions = useMemo(
    () => getLibrarySortOptions(collectionId),
    [collectionId],
  )

  const rightActions = useMemo(
    () => [
      {
        id: "sort",
        title: t("library.sortLabel"),
        subactions: sortOptions.map((option) => ({
          id: `sort:${option.value}`,
          title: `${sortBy === option.value ? "✓ " : ""}${t(option.labelKey)}`,
        })),
      },
      {
        id: "view",
        title: t("library.viewLabel"),
        subactions: libraryViewOptions.map((option) => ({
          id: `view:${option.value}`,
          title: `${viewMode === option.value ? "✓ " : ""}${t(option.labelKey)}`,
        })),
      },
    ],
    [sortBy, sortOptions, viewMode, t],
  )

  const handleRightMenuAction = useCallback(
    (event: string) => {
      if (event.startsWith("sort:")) {
        onSetSortBy(event.slice("sort:".length) as SortOption)
        return
      }

      if (event.startsWith("view:")) {
        onSetViewMode(event.slice("view:".length) as LibraryViewMode)
      }
    },
    [onSetSortBy, onSetViewMode],
  )

  return useMemo(
    () => ({
      headerRight: () => (
        <View className="flex-row items-center">
          {renderHeaderToolbarActions([syncAction])}
          <AndroidHeaderMenuButton
            menuRef={rightMenuRef}
            actions={rightActions}
            onPressAction={handleRightMenuAction}
            icon={TuneIcon}
            accessibilityLabel={t("library.viewConfig")}
            side="right"
            anchoredToRight
          />
        </View>
      ),
    }),
    [rightActions, rightMenuRef, syncAction, t, handleRightMenuAction],
  )
}
