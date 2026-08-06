import type { BuiltInBookCollectionId } from "@my-reader/tools/types/book-collection"
import { Stack } from "expo-router"
import { useTranslation } from "react-i18next"

import type { SortOption } from "@/src/features/library/hooks/use-books-for-collection"
import type { LibraryViewMode } from "@/src/store/app-store.types"

import {
  getLibrarySortOptions,
  libraryViewOptions,
} from "../../utils/library-header-config"

type LibraryIosHeaderToolbarProps = {
  collectionId: BuiltInBookCollectionId
  sortBy: SortOption
  viewMode: LibraryViewMode
  onSetSortBy: (value: SortOption) => void
  onSetViewMode: (value: LibraryViewMode) => void
}

/** Renders the iOS book-list menu with sorting and view settings only. */
export function LibraryIosHeaderToolbar({
  collectionId,
  sortBy,
  viewMode,
  onSetSortBy,
  onSetViewMode,
}: LibraryIosHeaderToolbarProps) {
  const { t } = useTranslation()
  const sortOptions = getLibrarySortOptions(collectionId)

  return (
    <Stack.Toolbar placement="right">
      <Stack.Toolbar.Menu icon="slider.horizontal.3">
        <Stack.Toolbar.Menu inline title={t("library.sortLabel")}>
          {sortOptions.map((option) => (
            <Stack.Toolbar.MenuAction
              key={`sort-${option.value}`}
              isOn={sortBy === option.value}
              onPress={() => onSetSortBy(option.value)}
            >
              {t(option.labelKey)}
            </Stack.Toolbar.MenuAction>
          ))}
        </Stack.Toolbar.Menu>
        <Stack.Toolbar.Menu inline title={t("library.viewLabel")}>
          {libraryViewOptions.map((option) => (
            <Stack.Toolbar.MenuAction
              key={`view-${option.value}`}
              isOn={viewMode === option.value}
              onPress={() => onSetViewMode(option.value)}
            >
              {t(option.labelKey)}
            </Stack.Toolbar.MenuAction>
          ))}
        </Stack.Toolbar.Menu>
      </Stack.Toolbar.Menu>
    </Stack.Toolbar>
  )
}
