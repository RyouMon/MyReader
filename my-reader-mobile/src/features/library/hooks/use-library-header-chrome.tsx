import { router } from "expo-router"
import type { NativeStackNavigationOptions } from "expo-router"
import { useCallback, useMemo, useRef, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { Platform } from "react-native"

import { useThemePalette } from "@/src/design/tokens"
import {
  useScreenHeader,
  type ScreenHeaderAction,
} from "@/src/navigation/hooks/use-screen-header"
import type { Library } from "@/src/domain/types"
import type {
  LibraryFilterOption,
  SortOption,
} from "@/src/features/library/hooks/use-book-filter"
import { getLibraryFilterTitle } from "@/src/features/library/utils/library-header-config"
import type { LibraryViewMode } from "@/src/store/app-store.types"

import { LibraryIosHeaderToolbar } from "../components/library-header/ios-header-toolbar"
import type { LibraryScreenVariant } from "../types/library-header"
import { resolveLibraryHeaderChromeMode } from "../utils/resolve-library-header-chrome-mode"
import { useLibraryAndroidHeaderMenuOptions } from "./use-library-android-header-menu-options"

type UseLibraryHeaderChromeParams = {
  variant: LibraryScreenVariant
  selectedLibrary: Library | null
  libraries: Library[]
  effectiveLibraryId?: string
  filter: LibraryFilterOption
  sortBy: SortOption
  viewMode: LibraryViewMode
  onSyncCurrentLibrary: () => void
  canImportBook: boolean
  onImportBook: () => void
  onSelectLibrary: (libraryId: string) => void
  onOpenLibrarySwitchMenu: () => void
  onSetFilter: (value: LibraryFilterOption) => void
  onSetSortBy: (value: SortOption) => void
  onSetViewMode: (value: LibraryViewMode) => void
  onQueryChange: (query: string) => void
  onSearchCancel: () => void
}

type UseLibraryHeaderChromeResult = {
  options: NativeStackNavigationOptions
  toolbar: ReactNode
}

/** Composes library index header chrome for the active screen variant. */
export function useLibraryHeaderChrome({
  variant,
  selectedLibrary,
  libraries,
  effectiveLibraryId,
  filter,
  sortBy,
  viewMode,
  onSyncCurrentLibrary,
  canImportBook,
  onImportBook,
  onSelectLibrary,
  onOpenLibrarySwitchMenu,
  onSetFilter,
  onSetSortBy,
  onSetViewMode,
  onQueryChange,
  onSearchCancel,
}: UseLibraryHeaderChromeParams): UseLibraryHeaderChromeResult {
  const { t } = useTranslation()
  const palette = useThemePalette()
  const leftMenuRef = useRef(null)
  const rightMenuRef = useRef(null)
  const chromeMode = resolveLibraryHeaderChromeMode(variant)
  const title =
    variant === "loaded" && selectedLibrary
      ? getLibraryFilterTitle(t, filter)
      : t("library.title")
  const [isSearchOpen, setIsSearchOpen] = useState(false)

  const handleSearchOpen = useCallback(() => setIsSearchOpen(true), [])
  const handleSearchClose = useCallback(() => {
    setIsSearchOpen(false)
    onSearchCancel()
  }, [onSearchCancel])

  const androidMenuOptions = useLibraryAndroidHeaderMenuOptions({
    leftMenuRef,
    rightMenuRef,
    libraries,
    effectiveLibraryId,
    filter,
    sortBy,
    viewMode,
    onSyncCurrentLibrary,
    canImportBook,
    onImportBook,
    onSelectLibrary,
    onSetFilter,
    onSetSortBy,
    onSetViewMode,
  })

  const rightActions = useMemo((): ScreenHeaderAction[] | undefined => {
    if (chromeMode !== "toolbar-right") {
      return undefined
    }

    return [
      {
        label: t("library.switchLibrary"),
        onPress: onOpenLibrarySwitchMenu,
        iosSfSymbol: "arrow.left.arrow.right",
      },
      {
        label: t("library.addLibrary"),
        onPress: () => router.push("/settings/add-library"),
        iosSfSymbol: "plus",
      },
    ]
  }, [chromeMode, onOpenLibrarySwitchMenu, t])

  const { options: baseOptions, toolbar: baseToolbar } = useScreenHeader({
    title,
    headerLargeTitle: true,
    right: rightActions,
  })

  const options = useMemo((): NativeStackNavigationOptions => {
    const merged = { ...baseOptions }

    if (variant === "empty") {
      merged.headerLargeTitleShadowVisible = false
    }

    if (chromeMode === "platform-menus" && Platform.OS === "android") {
      if (isSearchOpen && variant === "loaded") {
        merged.headerLeft = undefined
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
    chromeMode,
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
    if (chromeMode === "platform-menus" && Platform.OS === "ios") {
      return (
        <LibraryIosHeaderToolbar
          libraries={libraries}
          effectiveLibraryId={effectiveLibraryId}
          filter={filter}
          sortBy={sortBy}
          viewMode={viewMode}
          onSyncCurrentLibrary={onSyncCurrentLibrary}
          canImportBook={canImportBook}
          onImportBook={onImportBook}
          onSelectLibrary={onSelectLibrary}
          onSetFilter={onSetFilter}
          onSetSortBy={onSetSortBy}
          onSetViewMode={onSetViewMode}
        />
      )
    }
    return baseToolbar
  }, [
    baseToolbar,
    chromeMode,
    libraries,
    effectiveLibraryId,
    filter,
    sortBy,
    viewMode,
    onSyncCurrentLibrary,
    canImportBook,
    onImportBook,
    onSelectLibrary,
    onSetFilter,
    onSetSortBy,
    onSetViewMode,
  ])

  return { options, toolbar }
}
