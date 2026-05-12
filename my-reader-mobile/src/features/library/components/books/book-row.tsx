import { memo, useCallback, useMemo } from "react";

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { MenuView, type MenuAction } from "@react-native-menu/menu";
import { SymbolView } from "expo-symbols";
import { Platform } from "react-native";

import { buildBookMenuActions } from "@/src/data/book-menu";
import type { BookItem } from "@/src/data/types";
import { useThemePalette } from "@/src/design/tokens";
import { Pressable, Text, TouchableHighlight, View } from "@/tw";

import { CircularProgress } from "@/src/components/ui/circular-progress";
import { ProgressBar } from "@/src/components/ui/progress-bar";
import { BookCover, type BookDownloadStatus, type BookProgressSnapshot } from "./book-cover";
import { DownloadProgressIndicator } from "./download-progress-indicator";

/**
 * Returns the mobile row status label for an optional progress snapshot.
 */
function getProgressLabel(progress?: BookProgressSnapshot) {
  if (progress?.statusLabel) {
    return progress.statusLabel;
  }
  if (typeof progress?.percent !== "number" || progress.percent <= 0) {
    return "未读";
  }
  if (progress.percent >= 100) {
    return "已读完";
  }
  return "阅读中";
}

export type BookRowProps = {
  book: BookItem;
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
  horizontalPadding?: number;
  /**
   * Primitive menu inputs let the row build its own actions while keeping
   * `React.memo` shallow comparison cheap. Passing a single `menuConfig` object
   * would defeat memoization because the parent reallocates the object whenever
   * any of these fields change.
   */
  menuIsWebdav?: boolean;
  menuFormats?: string[];
  menuSelectedFormat?: string;
  /**
   * When set together, the row subscribes directly to the download store for
   * this book+format so progress updates do not re-render the parent list.
   * Falls back to `downloadProgress` when not set.
   */
  subscriptionLibraryId?: string;
  subscriptionFormat?: string;
};

function BookRowImpl({
  book,
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
  horizontalPadding = 16,
  menuIsWebdav,
  menuFormats,
  menuSelectedFormat,
  subscriptionLibraryId,
  subscriptionFormat,
}: BookRowProps) {
  const palette = useThemePalette();
  const hasProgress = typeof progress?.percent === "number";
  const progressValue = hasProgress ? Math.max(0, Math.min(100, progress.percent ?? 0)) / 100 : undefined;
  const isUnread = !hasProgress || (progress.percent ?? 0) <= 0;

  const showCloudIcon = downloadStatus === "notDownloaded";
  const showProgressIndicator = downloadStatus === "downloading";
  const hasSubscription = Boolean(subscriptionLibraryId && subscriptionFormat);

  const hasMenuInputs = menuIsWebdav !== undefined;
  const computedMenuActions = useMemo<MenuAction[] | undefined>(() => {
    if (!hasMenuInputs) return menuActions;
    return buildBookMenuActions(downloadStatus, {
      isWebdav: menuIsWebdav ?? false,
      formats: menuFormats,
      selectedFormat: menuSelectedFormat,
    });
  }, [downloadStatus, hasMenuInputs, menuActions, menuFormats, menuIsWebdav, menuSelectedFormat]);

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
      accessibilityLabel={`更多操作：${book.title}`}
      className="h-8 w-8 items-center justify-center"
      style={Platform.OS === "ios" ? { marginLeft: -2 } : undefined}
      onPress={handleMorePress}
    >
      {Platform.OS === "ios" ? (
        <SymbolView name="ellipsis" size={13} tintColor={palette.textMuted} />
      ) : (
        <MaterialIcons name="more-horiz" size={22} color={palette.textMuted} />
      )}
    </Pressable>
  );

  const menuTrigger = (
    <View
      accessibilityRole="button"
      accessibilityLabel={`更多操作：${book.title}`}
      className="h-8 w-8 items-center justify-center"
      style={Platform.OS === "ios" ? { marginLeft: -2 } : undefined}
    >
      {Platform.OS === "ios" ? (
        <SymbolView name="ellipsis" size={13} tintColor={palette.textMuted} />
      ) : (
        <MaterialIcons name="more-horiz" size={22} color={palette.textMuted} />
      )}
    </View>
  );

  return (
    <TouchableHighlight
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={`打开《${book.title}》`}
      onPress={handlePress}
      underlayColor={palette.backgroundSecondary}
    >
      <View className="min-h-[60px] flex-row items-center gap-3.5 border-b py-2.5" style={{ borderColor: palette.border, paddingHorizontal: horizontalPadding }}>
        <BookCover
          book={book}
          width={38}
          height={54}
          borderRadius={5}
          showTitle={false}
        />
        <View className="min-w-0 flex-1">
          <Text selectable className="text-[15px] font-semibold leading-5" style={{ color: palette.text }} numberOfLines={1}>
            {book.title}
          </Text>
          <Text selectable className="mt-0.5 text-[13px] leading-5" style={{ color: palette.textMuted }} numberOfLines={1}>
            {book.author}
          </Text>
          <View className="mt-0.5 flex-row flex-wrap items-center gap-1.5">
            <Text
              className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
              style={{
                backgroundColor: isUnread ? palette.backgroundSecondary : "rgba(217,119,87,0.14)",
                color: isUnread ? palette.textMuted : palette.primary,
              }}
            >
              {getProgressLabel(progress)}
            </Text>
            {hasProgress ? (
              <Text className="text-xs" style={{ color: palette.textMuted }}>
                {Math.round(progress.percent ?? 0)}%
              </Text>
            ) : null}
            {progress?.syncedLabel ? (
              <Text className="text-xs" style={{ color: palette.textMuted }}>
                {progress.syncedLabel}
              </Text>
            ) : null}
            <View className="ml-auto flex-row items-center">
              {showCloudIcon ? (
                Platform.OS === "ios" ? (
                  <SymbolView name="cloud.fill" size={13} tintColor={palette.textMuted} />
                ) : (
                  <MaterialIcons name="cloud" size={13} color={palette.textMuted} />
                )
              ) : showProgressIndicator ? (
                hasSubscription ? (
                  <DownloadProgressIndicator
                    libraryId={subscriptionLibraryId ?? ""}
                    bookId={book.id}
                    format={subscriptionFormat ?? ""}
                    size={13}
                    strokeWidth={1.5}
                    color={palette.primary}
                    fallbackProgress={downloadProgress}
                  />
                ) : (
                  <CircularProgress progress={downloadProgress ?? 0} size={13} strokeWidth={1.5} color={palette.primary} />
                )
              ) : null}
              {hasMenu ? (
                computedMenuActions && onMenuAction ? (
                  <View onStartShouldSetResponder={() => true}>
                    <MenuView
                      actions={computedMenuActions}
                      isAnchoredToRight={Platform.OS === "android"}
                      onOpenMenu={handleMenuOpenLocal}
                      onCloseMenu={onMenuClose}
                      onPressAction={handleMenuPressAction}
                    >
                      {menuTrigger}
                    </MenuView>
                  </View>
                ) : (
                  moreButton
                )
              ) : null}
            </View>
          </View>
          {typeof progressValue === "number" ? (
            <View className="mt-1 w-14">
              <ProgressBar progress={progressValue} />
            </View>
          ) : null}
        </View>
      </View>
    </TouchableHighlight>
  );
}

/**
 * Renders the mobile list row for a book.
 */
export const BookRow = memo(BookRowImpl);
