import type { BuiltInBookCollectionId } from "@my-reader/tools/types/book-collection"
import type { NativeStackNavigationOptions } from "expo-router"
import { type ReactNode, useMemo, useRef } from "react"
import { useTranslation } from "react-i18next"
import { Platform } from "react-native"

import { getBookCollectionDefinition } from "@/src/features/library/book-collection-definitions"
import type { SortOption } from "@/src/features/library/hooks/use-books-for-collection"
import { useSyncStatusHeaderAction } from "@/src/features/sync/hooks/use-sync-status-header-action"
import {
  useScreenHeader,
  type ScreenHeaderAction,
} from "@/src/navigation/hooks/use-screen-header"
import type { LibraryViewMode } from "@/src/store/app-store.types"

import { LibraryIosHeaderToolbar } from "../components/library-header/ios-header-toolbar"
import type { LibraryScreenVariant } from "../types/library-header"
import { useLibraryAndroidHeaderMenuOptions } from "./use-library-android-header-menu-options"

type UseLibraryHeaderChromeParams = {
  searchAction: ScreenHeaderAction
  title?: string
  variant: LibraryScreenVariant
  collectionId: BuiltInBookCollectionId
  sortBy: SortOption
  viewMode: LibraryViewMode
  onSetSortBy: (value: SortOption) => void
  onSetViewMode: (value: LibraryViewMode) => void
}

type UseLibraryHeaderChromeResult = {
  options: NativeStackNavigationOptions
  toolbar: ReactNode
}

/** Composes collection book-list header chrome for the active screen variant. */
export function useLibraryHeaderChrome({
  variant,
  searchAction,
  title: customTitle,
  collectionId,
  sortBy,
  viewMode,
  onSetSortBy,
  onSetViewMode,
}: UseLibraryHeaderChromeParams): UseLibraryHeaderChromeResult {
  const { t } = useTranslation()
  const syncAction = useSyncStatusHeaderAction()
  const rightMenuRef = useRef(null)
  const title =
    customTitle ?? t(getBookCollectionDefinition(collectionId).titleKey)

  const androidMenuOptions = useLibraryAndroidHeaderMenuOptions({
    rightMenuRef,
    collectionId,
    sortBy,
    viewMode,
    syncAction,
    searchAction,
    onSetSortBy,
    onSetViewMode,
  })

  const { options: baseOptions, toolbar: baseToolbar } = useScreenHeader({
    title,
    headerLargeTitle: true,
    right: [syncAction],
  })

  const options = useMemo((): NativeStackNavigationOptions => {
    const merged = { ...baseOptions }

    if (variant === "empty") {
      merged.headerLargeTitleShadowVisible = false
    }

    if (variant === "loaded" && Platform.OS === "android") {
      Object.assign(merged, androidMenuOptions)
    }

    return merged
  }, [baseOptions, androidMenuOptions, variant])

  const toolbar = useMemo((): ReactNode => {
    if (variant === "loaded" && Platform.OS === "ios") {
      return (
        <LibraryIosHeaderToolbar
          collectionId={collectionId}
          sortBy={sortBy}
          viewMode={viewMode}
          syncAction={syncAction}
          searchAction={searchAction}
          onSetSortBy={onSetSortBy}
          onSetViewMode={onSetViewMode}
        />
      )
    }
    return baseToolbar
  }, [
    baseToolbar,
    collectionId,
    sortBy,
    syncAction,
    searchAction,
    viewMode,
    onSetSortBy,
    onSetViewMode,
    variant,
  ])

  return { options, toolbar }
}
