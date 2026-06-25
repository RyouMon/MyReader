import { memo, useCallback, useMemo } from "react";

import { MenuView, type MenuAction } from "@react-native-menu/menu";
import { useTranslation } from "react-i18next";
import { Platform } from "react-native";

import { useTheme, useThemePalette } from "@/src/design/tokens";
import { TEXT_SIZE } from "@/src/design/typography";
import { pressedBackgroundColor, androidRippleColor } from "@/src/design/press-feedback";
import type { BookItem } from "@/src/domain/types";
import type { HomeCardStyle } from "@/src/store/app-store.types";
import { Pressable, Text, View } from "@/tw";
import { MoreActionsIcon } from "@/src/components/ui/more-actions-icon";
import {
  BookCover,
  type BookDownloadStatus,
} from "@/src/features/library/components/books/book-cover";
import { BookDownloadStatusIndicator } from "@/src/components/book-download-status-indicator";
import { CoverAdaptiveBackground } from "@/src/components/cover-adaptive-background";
import { useCoverPalette } from "@/src/domain/library/hooks/use-cover-palette";
import { buildBookMenuActions } from "@/src/features/library/utils/book-menu";

const COVER_HEIGHT = 100;
const COVER_ASPECT_RATIO = 2 / 3;
const COVER_WIDTH = Math.round(COVER_HEIGHT * COVER_ASPECT_RATIO);
const COVER_BORDER_RADIUS = 8;

export type ReadingListCardProps = {
  book: BookItem & { readingFormat?: string };
  width: number;
  progress: number;
  downloadStatus?: BookDownloadStatus;
  libraryId?: string;
  menuIsRemote?: boolean;
  menuFormats?: string[];
  menuSelectedFormat?: string;
  onPress?: (bookId: string) => void;
  onMenuAction?: (bookId: string, actionId: string) => void;
  onMenuOpen?: (bookId: string) => void;
  onMenuClose?: () => void;
  isAnyMenuOpen?: boolean;
  homeCardStyle?: HomeCardStyle;
};

function ReadingListCardImpl({
  book,
  width,
  progress,
  downloadStatus,
  libraryId,
  menuIsRemote,
  menuFormats,
  menuSelectedFormat,
  onPress,
  onMenuAction,
  onMenuOpen,
  onMenuClose,
  isAnyMenuOpen,
  homeCardStyle,
}: ReadingListCardProps) {
  const { t } = useTranslation();
  const palette = useThemePalette();
  const { colorScheme } = useTheme();
  const resolvedScheme = colorScheme === "dark" ? "dark" : "light";
  const { raw: coverRawColors } = useCoverPalette(book.coverUri, resolvedScheme);

  const showCloudIcon = downloadStatus === "notDownloaded";
  const showProgressIndicator = downloadStatus === "downloading";

  const computedMenuActions = useMemo<MenuAction[] | undefined>(() => {
    if (menuIsRemote === undefined) return undefined;
    return buildBookMenuActions(downloadStatus, {
      isRemote: menuIsRemote,
      formats: menuFormats,
      selectedFormat: menuSelectedFormat,
    });
  }, [downloadStatus, menuIsRemote, menuFormats, menuSelectedFormat]);

  const hasMenu = computedMenuActions && computedMenuActions.length > 0 && onMenuAction;

  const handlePress = useCallback(() => {
    if (isAnyMenuOpen || !onPress) return;
    onPress(book.id);
  }, [book.id, isAnyMenuOpen, onPress]);

  const handleMenuOpenLocal = useCallback(() => {
    onMenuOpen?.(book.id);
  }, [book.id, onMenuOpen]);

  const handleMenuPressAction = useCallback(
    ({ nativeEvent }: { nativeEvent: { event: string } }) => {
      onMenuAction?.(book.id, nativeEvent.event);
    },
    [book.id, onMenuAction],
  );

  const menuTrigger = (
    <View
      accessibilityRole="button"
      accessibilityLabel={t("bookDetail.moreActions", { title: book.title })}
      className="h-8 w-8 items-center justify-center"
    >
      <MoreActionsIcon size={TEXT_SIZE.base} color={palette.textMuted} />
    </View>
  );

  const cardContent = (
    <View className="flex-row items-center gap-3 p-3">
      <BookCover
        book={book}
        width={COVER_WIDTH}
        height={COVER_HEIGHT}
        borderRadius={COVER_BORDER_RADIUS}
        showTitle={false}
      />
      <View className="min-w-0 flex-1 justify-center gap-1">
        <Text className="text-base font-bold" style={{ color: palette.text }} numberOfLines={1}>
          {book.title}
        </Text>
        <Text className="text-sm" style={{ color: palette.textMuted }} numberOfLines={1}>
          {book.author}
        </Text>
        <View className="flex-row items-center gap-1.5">
          <Text
            className="text-sm font-medium"
            style={{ color: palette.textMuted, fontVariant: ["tabular-nums"] }}
          >
            {Math.round(progress)}%
          </Text>
          {showCloudIcon || showProgressIndicator ? (
            <BookDownloadStatusIndicator
              status={downloadStatus}
              libraryId={libraryId}
              bookId={book.id}
              format={book.readingFormat}
            />
          ) : null}
        </View>
      </View>
      {hasMenu ? (
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
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("bookDetail.moreActions", { title: book.title })}
          className="h-8 w-8 items-center justify-center"
        >
          <MoreActionsIcon size={TEXT_SIZE.base} color={palette.textMuted} />
        </Pressable>
      )}
    </View>
  );

  return (
    <View
      style={{
        width,
        borderRadius: 16,
        backgroundColor: palette.surface,
        borderColor: palette.border,
        borderWidth: 1,
        boxShadow: palette.shadowMd,
        overflow: "hidden",
      }}
    >
      <CoverAdaptiveBackground
        coverUri={book.coverUri}
        rawColors={coverRawColors}
        colorScheme={resolvedScheme}
        borderRadius={16}
        variant={homeCardStyle}
      />
      <Pressable
        accessibilityRole={onPress ? "button" : undefined}
        accessibilityLabel={t("bookDetail.openBook", { title: book.title })}
        onPress={handlePress}
        android_ripple={{ color: androidRippleColor(resolvedScheme, palette), foreground: true }}
        style={({ pressed }) => ({
          borderRadius: 16,
          overflow: "hidden",
          backgroundColor: Platform.OS === "ios" && pressed ? pressedBackgroundColor(resolvedScheme, palette) : undefined,
        })}
      >
        {cardContent}
      </Pressable>
    </View>
  );
}

/**
 * Compact horizontal reading card: cover + title/author/progress + more menu.
 */
export const ReadingListCard = memo(ReadingListCardImpl);
