import { memo, useCallback, useMemo } from "react";

import { MenuView, type MenuAction } from "@react-native-menu/menu";
import { useTranslation } from "react-i18next";
import { Platform } from "react-native";

import { MoreActionsIcon } from "@/src/components/ui/more-actions-icon";
import { useThemePalette } from "@/src/design/tokens";
import { TEXT_SIZE } from "@/src/design/typography";
import type { BookItem } from "@/src/domain/types";
import { Pressable, Text, TouchableHighlight, View } from "@/tw";
import { buildBookMenuActions } from "../../utils/book-menu";
import { BookCover, type BookDownloadStatus } from "./book-cover";

const COVER_HEIGHT = 100;
const COVER_ASPECT_RATIO = 2 / 3;
const COVER_WIDTH = Math.round(COVER_HEIGHT * COVER_ASPECT_RATIO);
const COVER_BORDER_RADIUS = 8;

export type ReadingListCardProps = {
  book: BookItem;
  width: number;
  progress: number;
  downloadStatus?: BookDownloadStatus;
  menuIsRemote?: boolean;
  menuFormats?: string[];
  menuSelectedFormat?: string;
  onPress?: (bookId: string) => void;
  onMenuAction?: (bookId: string, actionId: string) => void;
  onMenuOpen?: (bookId: string) => void;
  onMenuClose?: () => void;
  isAnyMenuOpen?: boolean;
};

function ReadingListCardImpl({
  book,
  width,
  progress,
  downloadStatus,
  menuIsRemote,
  menuFormats,
  menuSelectedFormat,
  onPress,
  onMenuAction,
  onMenuOpen,
  onMenuClose,
  isAnyMenuOpen,
}: ReadingListCardProps) {
  const { t } = useTranslation();
  const palette = useThemePalette();

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

  return (
    <TouchableHighlight
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={t("bookDetail.openBook", { title: book.title })}
      onPress={handlePress}
      underlayColor={palette.surface}
      style={{
        width,
        borderRadius: 16,
        overflow: "hidden",
      }}
    >
      <View
        className="flex-row items-center gap-3 p-3"
        style={{ backgroundColor: palette.backgroundSecondary }}
      >
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
          <Text
            className="text-sm font-medium"
            style={{ color: palette.primary, fontVariant: ["tabular-nums"] }}
          >
            {Math.round(progress)}%
          </Text>
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
    </TouchableHighlight>
  );
}

/**
 * Compact horizontal reading card: cover + title/author/progress + more menu.
 */
export const ReadingListCard = memo(ReadingListCardImpl);
