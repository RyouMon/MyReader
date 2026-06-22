import { memo, useCallback, useMemo } from "react";

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { MenuView, type MenuAction } from "@react-native-menu/menu";
import { SymbolView } from "expo-symbols";
import { useTranslation } from "react-i18next";
import { Platform } from "react-native";

import { useThemePalette } from "@/src/design/tokens";
import type { BookItem } from "@/src/domain/types";
import { Pressable, Text, TouchableHighlight, View } from "@/tw";
import { buildBookMenuActions } from "../../utils/book-menu";

import { CircularProgress } from "@/src/components/ui/circular-progress";
import { ProgressBar } from "@/src/components/ui/progress-bar";
import { BookCover, type BookDownloadStatus, type BookProgressSnapshot } from "./book-cover";
import { DownloadProgressIndicator } from "./download-progress-indicator";

export type BookCardProps = {
  book: BookItem;
  width: number;
  /**
   * Handlers receive `bookId` so the parent can keep a single stable callback
   * across all cells, which lets React.memo short-circuit cell renders.
   */
  onPress?: (bookId: string) => void;
  onMore?: (bookId: string) => void;
  menuActions?: MenuAction[];
  onMenuAction?: (bookId: string, actionId: string) => void;
  onMenuOpen?: (bookId: string) => void;
  onMenuClose?: () => void;
  isAnyMenuOpen?: boolean;
  progress?: BookProgressSnapshot;
  downloadStatus?: BookDownloadStatus;
  downloadProgress?: number;
  /**
   * Primitive menu inputs let the card build its own actions while keeping
   * `React.memo` shallow comparison cheap. Passing a single `menuConfig` object
   * would defeat memoization because the parent reallocates the object whenever
   * any of these fields change.
   */
  menuIsRemote?: boolean;
  menuFormats?: string[];
  menuSelectedFormat?: string;
  /**
   * When set together, the card subscribes directly to the download store for
   * this book+format so progress updates do not re-render the parent list.
   * Falls back to `downloadProgress` when not set.
   */
  subscriptionLibraryId?: string;
  subscriptionFormat?: string;
};

function BookCardImpl({
  book,
  width,
  onPress,
  onMore,
  menuActions,
  onMenuAction,
  onMenuOpen,
  onMenuClose,
  isAnyMenuOpen,
  progress,
  downloadStatus,
  downloadProgress,
  menuIsRemote,
  menuFormats,
  menuSelectedFormat,
  subscriptionLibraryId,
  subscriptionFormat,
}: BookCardProps) {
  const { t } = useTranslation();
  const palette = useThemePalette();
  const coverHeight = Math.round(width * 1.43);
  const progressValue = typeof progress?.percent === "number" ? Math.max(0, Math.min(100, progress.percent)) / 100 : undefined;

  const showCloudIcon = downloadStatus === "notDownloaded";
  const showProgressIndicator = downloadStatus === "downloading";
  const hasSubscription = Boolean(subscriptionLibraryId && subscriptionFormat);

  const hasMenuInputs = menuIsRemote !== undefined;
  const computedMenuActions = useMemo<MenuAction[] | undefined>(() => {
    if (!hasMenuInputs) return menuActions;
    return buildBookMenuActions(downloadStatus, {
      isRemote: menuIsRemote ?? false,
      formats: menuFormats,
      selectedFormat: menuSelectedFormat,
    });
  }, [downloadStatus, hasMenuInputs, menuActions, menuFormats, menuIsRemote, menuSelectedFormat]);

  const hasMenu = (computedMenuActions && computedMenuActions.length > 0 && onMenuAction) || onMore;

  const handlePress = useCallback(() => {
    if (isAnyMenuOpen || !onPress) return;
    onPress(book.id);
  }, [book.id, isAnyMenuOpen, onPress]);

  const handleMorePress = useCallback(
    (event: { stopPropagation?: () => void }) => {
      event.stopPropagation?.();
      onMore?.(book.id);
    },
    [book.id, onMore],
  );

  const handleMenuOpenLocal = useCallback(() => {
    onMenuOpen?.(book.id);
  }, [book.id, onMenuOpen]);

  const handleMenuPressAction = useCallback(
    ({ nativeEvent }: { nativeEvent: { event: string } }) => {
      onMenuAction?.(book.id, nativeEvent.event);
    },
    [book.id, onMenuAction],
  );

  const moreButton = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("bookDetail.moreActions", { title: book.title })}
      className="h-8 w-8 items-center justify-center"
      style={Platform.OS === "ios" ? { marginLeft: -2 } : undefined}
      onPress={handleMorePress}
    >
      {Platform.OS === "ios" ? (
        <SymbolView name="ellipsis" size={14} tintColor={palette.textMuted} />
      ) : (
        <MaterialIcons name="more-horiz" size={22} color={palette.textMuted} />
      )}
    </Pressable>
  );

  const menuTrigger = (
    <View
      accessibilityRole="button"
      accessibilityLabel={t("bookDetail.moreActions", { title: book.title })}
      className="h-8 w-8 items-center justify-center"
      style={Platform.OS === "ios" ? { marginLeft: -2 } : undefined}
    >
      {Platform.OS === "ios" ? (
        <SymbolView name="ellipsis" size={14} tintColor={palette.textMuted} />
      ) : (
        <MaterialIcons name="more-horiz" size={22} color={palette.textMuted} />
      )}
    </View>
  );

  return (
    <View
      style={{
        width,
      }}
    >
      <View className="relative">
        <TouchableHighlight
          accessibilityRole={onPress ? "button" : undefined}
          accessibilityLabel={t("bookDetail.openBook", { title: book.title })}
          onPress={handlePress}
          activeOpacity={0.78}
          underlayColor={palette.surface}
          style={{ borderRadius: 10, overflow: "hidden" }}
        >
          <View>
            <BookCover
              book={book}
              width={width}
              height={coverHeight}
              borderRadius={10}
            />
          </View>
        </TouchableHighlight>
      </View>
      <Text selectable className="mt-2 text-[15px] font-semibold leading-5" style={{ color: palette.text }} numberOfLines={1}>
        {book.title}
      </Text>
      <View className="flex-row items-center">
        <Text selectable className="flex-1 text-sm leading-5" style={{ color: palette.textMuted }} numberOfLines={1}>
          {book.author}
        </Text>
        <View className="flex-row items-center">
          {showCloudIcon ? (
            Platform.OS === "ios" ? (
              <SymbolView name="cloud.fill" size={14} tintColor={palette.textMuted} />
            ) : (
              <MaterialIcons name="cloud" size={14} color={palette.textMuted} />
            )
          ) : showProgressIndicator ? (
            hasSubscription ? (
              <DownloadProgressIndicator
                libraryId={subscriptionLibraryId ?? ""}
                bookId={book.id}
                format={subscriptionFormat ?? ""}
                size={14}
                strokeWidth={1.5}
                color={palette.primary}
                fallbackProgress={downloadProgress}
              />
            ) : (
              <CircularProgress progress={downloadProgress ?? 0} indeterminate={!downloadProgress} size={14} strokeWidth={1.5} color={palette.primary} />
            )
          ) : null}
          {hasMenu ? (
            computedMenuActions && onMenuAction ? (
              <MenuView
                actions={computedMenuActions}
                isAnchoredToRight={Platform.OS === "android"}
                onOpenMenu={handleMenuOpenLocal}
                onCloseMenu={onMenuClose}
                onPressAction={handleMenuPressAction}
              >
                {menuTrigger}
              </MenuView>
            ) : (
              moreButton
            )
          ) : null}
        </View>
      </View>
      {typeof progressValue === "number" ? (
        <View className="mt-2">
          <ProgressBar progress={progressValue} />
        </View>
      ) : null}
    </View>
  );
}

/**
 * Renders the mobile cover-first book card.
 */
export const BookCard = memo(BookCardImpl);
