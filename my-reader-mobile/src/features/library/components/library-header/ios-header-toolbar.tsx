import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";

import type { Library } from "@/src/domain/types";
import type { DownloadFilterOption, SortOption } from "@/src/features/library/hooks/use-book-filter";
import type { LibraryViewMode } from "@/src/store/app-store.types";

import {
  libraryDownloadFilterOptions,
  librarySortOptions,
  libraryViewOptions,
} from "../../utils/library-header-config";

type LibraryIosHeaderToolbarProps = {
  libraries: Library[];
  effectiveLibraryId?: string;
  downloadFilter: DownloadFilterOption;
  sortBy: SortOption;
  viewMode: LibraryViewMode;
  onSyncCurrentLibrary: () => void;
  onSelectLibrary: (libraryId: string) => void;
  onSetDownloadFilter: (value: DownloadFilterOption) => void;
  onSetSortBy: (value: SortOption) => void;
  onSetViewMode: (value: LibraryViewMode) => void;
};

/** Renders iOS native stack toolbar menus for library actions and view config. */
export function LibraryIosHeaderToolbar({
  libraries,
  effectiveLibraryId,
  downloadFilter,
  sortBy,
  viewMode,
  onSyncCurrentLibrary,
  onSelectLibrary,
  onSetDownloadFilter,
  onSetSortBy,
  onSetViewMode,
}: LibraryIosHeaderToolbarProps) {
  const { t } = useTranslation();

  return (
    <>
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Menu icon="ellipsis">
          <Stack.Toolbar.MenuAction onPress={onSyncCurrentLibrary}>
            {t("library.syncCurrentLibrary")}
          </Stack.Toolbar.MenuAction>
          <Stack.Toolbar.Menu inline title={t("library.switchLibrary")}>
            {libraries.map((library) => (
              <Stack.Toolbar.MenuAction
                key={`library-${library.id}`}
                isOn={effectiveLibraryId === library.id}
                onPress={() => onSelectLibrary(library.id)}
              >
                {library.name}
              </Stack.Toolbar.MenuAction>
            ))}
          </Stack.Toolbar.Menu>
        </Stack.Toolbar.Menu>
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Menu icon="line.3.horizontal.decrease">
          <Stack.Toolbar.Menu inline title={t("library.filterLabel")}>
            {libraryDownloadFilterOptions.map((option) => (
              <Stack.Toolbar.MenuAction
                key={`download-filter-${option.value}`}
                isOn={downloadFilter === option.value}
                onPress={() => onSetDownloadFilter(option.value)}
              >
                {t(option.labelKey)}
              </Stack.Toolbar.MenuAction>
            ))}
          </Stack.Toolbar.Menu>
          <Stack.Toolbar.Menu inline title={t("library.sortLabel")}>
            {librarySortOptions.map((option) => (
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
    </>
  );
}
