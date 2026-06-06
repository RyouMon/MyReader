import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { MenuView, type MenuComponentRef } from "@react-native-menu/menu";
import type { NativeStackNavigationOptions } from "expo-router";
import { useMemo, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { AndroidMenuRippleButton } from "@/src/components/ui/AndroidMenuRippleButton";
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
  textColor: string;
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
  textColor,
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
        <View className="h-10 w-10">
          <MenuView
            ref={leftMenuRef}
            actions={leftActions}
            onPressAction={({ nativeEvent }) => handleLeftMenuAction(nativeEvent.event)}
            style={{ position: "absolute", top: 0, left: 0, width: 40, height: 40, opacity: 0 }}
          >
            <View className="h-10 w-10" />
          </MenuView>
          <AndroidMenuRippleButton
            menuRef={leftMenuRef}
            icon={<MaterialIcons name="more-vert" size={22} color={textColor} />}
            accessibilityLabel={t("library.libraryActions")}
          />
        </View>
      ),
      headerRight: () => (
        <View className="h-10 w-10">
          <MenuView
            ref={rightMenuRef}
            actions={rightActions}
            isAnchoredToRight
            onPressAction={({ nativeEvent }) => handleRightMenuAction(nativeEvent.event)}
            style={{ position: "absolute", top: 0, left: 0, width: 40, height: 40, opacity: 0 }}
          >
            <View className="h-10 w-10" />
          </MenuView>
          <AndroidMenuRippleButton
            menuRef={rightMenuRef}
            icon={<MaterialIcons name="tune" size={22} color={textColor} />}
            accessibilityLabel={t("library.viewConfig")}
          />
        </View>
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
      textColor,
    ],
  );
}
