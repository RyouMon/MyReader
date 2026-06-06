import { router } from "expo-router";
import type { NativeStackNavigationOptions } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useMemo, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Platform } from "react-native";

import type { HeaderToolbarAction } from "@/src/components";
import { useThemePalette } from "@/src/design/tokens";
import type { Library } from "@/src/domain/types";
import type { DownloadFilterOption, SortOption } from "@/src/hooks/use-library-book-search";
import type { LibraryViewMode } from "@/src/store/app-store.types";

import { LibraryIosHeaderToolbar } from "../components/library-header/ios-header-toolbar";
import type { LibraryScreenVariant } from "../types/library-header";
import { resolveLibraryHeaderChromeMode } from "../utils/resolve-library-header-chrome-mode";
import { useLibraryAndroidHeaderMenuOptions } from "./use-library-android-header-menu-options";

type UseLibraryHeaderChromeParams = {
  variant: LibraryScreenVariant;
  selectedLibrary: Library | null;
  libraries: Library[];
  effectiveLibraryId?: string;
  downloadFilter: DownloadFilterOption;
  sortBy: SortOption;
  viewMode: LibraryViewMode;
  onSyncCurrentLibrary: () => void;
  onSelectLibrary: (libraryId: string) => void;
  onOpenLibrarySwitchMenu: () => void;
  onSetDownloadFilter: (value: DownloadFilterOption) => void;
  onSetSortBy: (value: SortOption) => void;
  onSetViewMode: (value: LibraryViewMode) => void;
};

type UseLibraryHeaderChromeResult = {
  stackScreenOptions: NativeStackNavigationOptions;
  toolbarRight?: HeaderToolbarAction[];
  iosToolbar: ReactNode;
};

/** Composes library index header chrome for the active screen variant. */
export function useLibraryHeaderChrome({
  variant,
  selectedLibrary,
  libraries,
  effectiveLibraryId,
  downloadFilter,
  sortBy,
  viewMode,
  onSyncCurrentLibrary,
  onSelectLibrary,
  onOpenLibrarySwitchMenu,
  onSetDownloadFilter,
  onSetSortBy,
  onSetViewMode,
}: UseLibraryHeaderChromeParams): UseLibraryHeaderChromeResult {
  const { t } = useTranslation();
  const palette = useThemePalette();
  const leftMenuRef = useRef(null);
  const rightMenuRef = useRef(null);
  const chromeMode = resolveLibraryHeaderChromeMode(variant);
  const title = variant === "loaded" && selectedLibrary ? selectedLibrary.name : t("library.title");

  const androidMenuOptions = useLibraryAndroidHeaderMenuOptions({
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
    textColor: palette.text,
  });

  const toolbarRight = useMemo((): HeaderToolbarAction[] | undefined => {
    if (chromeMode !== "toolbar-right") {
      return undefined;
    }

    if (variant === "empty") {
      return [
        {
          label: t("library.addLibrary"),
          onPress: () => router.push("/settings/add-library"),
          icon: <SymbolView name="plus" size={18} tintColor={palette.text} />,
          iosSfSymbol: "plus",
        },
      ];
    }

    return [
      {
        label: t("library.switchLibrary"),
        onPress: onOpenLibrarySwitchMenu,
        icon: <SymbolView name="arrow.left.arrow.right" size={18} tintColor={palette.text} />,
        iosSfSymbol: "arrow.left.arrow.right",
      },
      {
        label: t("library.addLibrary"),
        onPress: () => router.push("/settings/add-library"),
        icon: <SymbolView name="plus" size={18} tintColor={palette.text} />,
        iosSfSymbol: "plus",
      },
    ];
  }, [chromeMode, onOpenLibrarySwitchMenu, palette.text, t, variant]);

  const stackScreenOptions = useMemo((): NativeStackNavigationOptions => {
    const options: NativeStackNavigationOptions = {
      title,
      headerLargeTitle: true,
    };

    if (variant === "empty") {
      options.headerLargeTitleShadowVisible = false;
    }

    if (chromeMode === "platform-menus" && Platform.OS === "android") {
      Object.assign(options, androidMenuOptions);
    }

    return options;
  }, [androidMenuOptions, chromeMode, title, variant]);

  const iosToolbar =
    chromeMode === "platform-menus" && Platform.OS === "ios" ? (
      <LibraryIosHeaderToolbar
        libraries={libraries}
        effectiveLibraryId={effectiveLibraryId}
        downloadFilter={downloadFilter}
        sortBy={sortBy}
        viewMode={viewMode}
        onSyncCurrentLibrary={onSyncCurrentLibrary}
        onSelectLibrary={onSelectLibrary}
        onSetDownloadFilter={onSetDownloadFilter}
        onSetSortBy={onSetSortBy}
        onSetViewMode={onSetViewMode}
      />
    ) : null;

  return {
    stackScreenOptions,
    toolbarRight,
    iosToolbar,
  };
}
