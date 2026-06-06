import { MenuView, type MenuComponentRef } from "@react-native-menu/menu";
import type { NativeStackNavigationOptions } from "expo-router";
import { useMemo, type RefObject } from "react";
import { useTranslation } from "react-i18next";

import MoreVertIcon from "@expo/material-symbols/more_vert.xml";
import TuneIcon from "@expo/material-symbols/tune.xml";

import {
  AndroidHeaderMenuButton,
} from "@/src/components/ui/android-header-menu-button";
import type { Library } from "@/src/domain/types";
import type { DownloadFilterOption, SortOption } from "@/src/hooks/use-library-book-search";
import type { LibraryViewMode } from "@/src/store/app-store.types";

import {
  libraryDownloadFilterOptions,
  librarySortOptions,
  libraryViewOptions,
} from "../utils/library-header-config";

type UseLibraryAndroidHeaderMenuOptionsParams = {
  leftMenuRef: RefObject<MenuComponentRef | null>;
  rightMenuRef: RefObject<MenuComponentRef | null>;
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

/** Builds Android native-stack header slots for library filter/switch menus. */
export function useLibraryAndroidHeaderMenuOptions({
  leftMenuRef,
  rightMenuRef,
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
}: UseLibraryAndroidHeaderMenuOptionsParams): Pick<
  NativeStackNavigationOptions,
  "headerBackVisible" | "headerLeft" | "headerRight"
> {
  const { t } = useTranslation();

  const leftActions = useMemo(
    () => [
      { id: "refreshLibrary", title: t("library.syncCurrentLibrary") },
      {
        id: "switchLibrary",
        title: t("library.switchLibrary"),
        subactions: libraries.map((library) => ({
          id: `switchLibrary:${library.id}`,
          title: `${effectiveLibraryId === library.id ? "✓ " : ""}${library.name}`,
        })),
      },
    ],
    [effectiveLibraryId, libraries, t],
  );

  const rightActions = useMemo(
    () => [
      {
        id: "filter",
        title: t("library.filterLabel"),
        subactions: libraryDownloadFilterOptions.map((option) => ({
          id: `filter:${option.value}`,
          title: `${downloadFilter === option.value ? "✓ " : ""}${t(option.labelKey)}`,
        })),
      },
      {
        id: "sort",
        title: t("library.sortLabel"),
        subactions: librarySortOptions.map((option) => ({
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
    [downloadFilter, sortBy, viewMode, t],
  );

  function handleLeftMenuAction(event: string) {
    if (event === "refreshLibrary") {
      onSyncCurrentLibrary();
      return;
    }

    if (event.startsWith("switchLibrary:")) {
      onSelectLibrary(event.slice("switchLibrary:".length));
    }
  }

  function handleRightMenuAction(event: string) {
    if (event.startsWith("filter:")) {
      onSetDownloadFilter(event.slice("filter:".length) as DownloadFilterOption);
      return;
    }

    if (event.startsWith("sort:")) {
      onSetSortBy(event.slice("sort:".length) as SortOption);
      return;
    }

    if (event.startsWith("view:")) {
      onSetViewMode(event.slice("view:".length) as LibraryViewMode);
    }
  }

  return useMemo(
    () => ({
      headerBackVisible: false,
      headerLeft: () => (
        <AndroidHeaderMenuButton
          menuRef={leftMenuRef}
          actions={leftActions}
          onPressAction={handleLeftMenuAction}
          icon={MoreVertIcon}
          accessibilityLabel={t("library.libraryActions")}
          side="left"
        />
      ),
      headerRight: () => (
        <AndroidHeaderMenuButton
          menuRef={rightMenuRef}
          actions={rightActions}
          onPressAction={handleRightMenuAction}
          icon={TuneIcon}
          accessibilityLabel={t("library.viewConfig")}
          side="right"
          anchoredToRight
        />
      ),
    }),
    [
      leftActions,
      leftMenuRef,
      onSelectLibrary,
      onSetDownloadFilter,
      onSetSortBy,
      onSetViewMode,
      onSyncCurrentLibrary,
      rightActions,
      rightMenuRef,
      t,
    ],
  );
}
