import type { BuiltInBookCollectionId } from "@my-reader/tools/types/book-collection"
import type { NativeStackNavigationOptions } from "expo-router"
import { type ReactNode, useCallback, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Platform } from "react-native"

import { useThemePalette } from "@/src/design/tokens"
import { getBookCollectionDefinition } from "@/src/features/library/book-collection-definitions"
import type { SortOption } from "@/src/features/library/hooks/use-books-for-collection"
import { useSyncStatusHeaderAction } from "@/src/features/sync/hooks/use-sync-status-header-action"
import { useScreenHeader } from "@/src/navigation/hooks/use-screen-header"
import type { LibraryViewMode } from "@/src/store/app-store.types"

import { LibraryIosHeaderToolbar } from "../components/library-header/ios-header-toolbar"
import type { LibraryScreenVariant } from "../types/library-header"
import { useLibraryAndroidHeaderMenuOptions } from "./use-library-android-header-menu-options"

type UseLibraryHeaderChromeParams = {
  variant: LibraryScreenVariant
  collectionId: BuiltInBookCollectionId
  sortBy: SortOption
  viewMode: LibraryViewMode
  onSetSortBy: (value: SortOption) => void
  onSetViewMode: (value: LibraryViewMode) => void
  onQueryChange: (query: string) => void
  onSearchCancel: () => void
}

type UseLibraryHeaderChromeResult = {
  options: NativeStackNavigationOptions
  toolbar: ReactNode
}

/** Composes collection book-list header chrome for the active screen variant. */
export function useLibraryHeaderChrome({
  variant,
  collectionId,
  sortBy,
  viewMode,
  onSetSortBy,
  onSetViewMode,
  onQueryChange,
  onSearchCancel,
}: UseLibraryHeaderChromeParams): UseLibraryHeaderChromeResult {
  const { t } = useTranslation()
  const palette = useThemePalette()
  const syncAction = useSyncStatusHeaderAction()
  const rightMenuRef = useRef(null)
  const title = t(getBookCollectionDefinition(collectionId).titleKey)
  const [isSearchOpen, setIsSearchOpen] = useState(false)

  const handleSearchOpen = useCallback(() => setIsSearchOpen(true), [])
  const handleSearchClose = useCallback(() => {
    setIsSearchOpen(false)
    onSearchCancel()
  }, [onSearchCancel])

  const androidMenuOptions = useLibraryAndroidHeaderMenuOptions({
    rightMenuRef,
    collectionId,
    sortBy,
    viewMode,
    syncAction,
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
      if (isSearchOpen) {
        merged.headerRight = undefined
      } else {
        Object.assign(merged, androidMenuOptions)
      }
    }

    if (variant === "loaded") {
      merged.headerSearchBarOptions = {
        placeholder: t("library.searchPlaceholder"),
        hideWhenScrolling: Platform.OS === "ios",
        autoCapitalize: "none",
        textColor: palette.text,
        ...(Platform.OS === "android" && {
          hintTextColor: palette.textMuted,
          headerIconColor: palette.text,
        }),
        onChangeText: (e: { nativeEvent: { text: string } }) =>
          onQueryChange(e.nativeEvent.text),
        onCancelButtonPress: onSearchCancel,
        onOpen: handleSearchOpen,
        onClose: handleSearchClose,
      }
    }

    return merged
  }, [
    baseOptions,
    androidMenuOptions,
    variant,
    t,
    onQueryChange,
    onSearchCancel,
    isSearchOpen,
    handleSearchOpen,
    handleSearchClose,
    palette.text,
    palette.textMuted,
  ])

  const toolbar = useMemo((): ReactNode => {
    if (variant === "loaded" && Platform.OS === "ios") {
      return (
        <LibraryIosHeaderToolbar
          collectionId={collectionId}
          sortBy={sortBy}
          viewMode={viewMode}
          syncAction={syncAction}
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
    viewMode,
    onSetSortBy,
    onSetViewMode,
    variant,
  ])

  return { options, toolbar }
}
