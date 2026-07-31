import { memo, useCallback, useMemo, useRef } from "react"

import { MenuView, type MenuAction } from "@react-native-menu/menu"
import { useTranslation } from "react-i18next"
import { Platform, View as RNView } from "react-native"

import { BookDownloadStatusIndicator } from "@/src/components/book-download-status-indicator"
import { CoverAdaptiveBackground } from "@/src/components/cover-adaptive-background"
import { MoreActionsIcon } from "@/src/components/ui/more-actions-icon"
import { ICON_SIZE } from "@/src/design/icon-sizes"
import {
  androidRippleColor,
  pressedBackgroundColor,
} from "@/src/design/press-feedback"
import { useTheme, useThemePalette } from "@/src/design/tokens"
import { useCoverPalette } from "@/src/domain/library/hooks/use-cover-palette"
import type { BookItem } from "@/src/domain/types"
import {
  BookCover,
  type BookDownloadStatus,
} from "@/src/features/library/components/books/book-cover"
import { useCoverThumbnailSessionUri } from "@/src/features/library/cover-thumbnail-session-store"
import { buildBookMenuActions } from "@/src/features/library/utils/book-menu"
import {
  canStartReaderOpenTransition,
  measureReaderTransitionFrame,
  startReaderOpenTransition,
} from "@/src/features/reader/reader-open-transition"
import type { HomeCardStyle } from "@/src/store/app-store.types"
import { Pressable, Text, View } from "@/tw"

const COVER_HEIGHT = 100
const COVER_ASPECT_RATIO = 2 / 3
const COVER_WIDTH = Math.round(COVER_HEIGHT * COVER_ASPECT_RATIO)
const COVER_BORDER_RADIUS = 8

export type ReadingListCardProps = {
  book: BookItem & { readingFormat?: string }
  width: number
  progress: number
  downloadStatus?: BookDownloadStatus
  libraryId?: string
  menuIsRemote?: boolean
  menuFormats?: string[]
  menuSelectedFormat?: string
  isFavorite?: boolean
  onPress?: (bookId: string) => void
  onMenuAction?: (bookId: string, actionId: string) => void
  onMenuOpen?: (bookId: string) => void
  onMenuClose?: () => void
  isAnyMenuOpen?: boolean
  homeCardStyle?: HomeCardStyle
  thumbnailScopeKey?: string
}

function ReadingListCardImpl({
  book,
  width,
  progress,
  downloadStatus,
  libraryId,
  menuIsRemote,
  menuFormats,
  menuSelectedFormat,
  isFavorite,
  onPress,
  onMenuAction,
  onMenuOpen,
  onMenuClose,
  isAnyMenuOpen,
  homeCardStyle,
  thumbnailScopeKey,
}: ReadingListCardProps) {
  const { t } = useTranslation()
  const palette = useThemePalette()
  const { colorScheme } = useTheme()
  const resolvedScheme = colorScheme === "dark" ? "dark" : "light"
  const thumbnailCoverUri = useCoverThumbnailSessionUri(thumbnailScopeKey, book)
  const displayCoverUri = thumbnailCoverUri ?? book.coverUri
  const { raw: coverRawColors } = useCoverPalette(
    displayCoverUri,
    resolvedScheme,
  )
  const coverRef = useRef<RNView>(null)

  const showCloudIcon = downloadStatus === "notDownloaded"
  const showProgressIndicator = downloadStatus === "downloading"

  const computedMenuActions = useMemo<MenuAction[] | undefined>(() => {
    if (menuIsRemote === undefined) return undefined
    return buildBookMenuActions(downloadStatus, {
      isRemote: menuIsRemote,
      isFavorite,
      formats: menuFormats,
      selectedFormat: menuSelectedFormat,
    })
  }, [
    downloadStatus,
    menuIsRemote,
    menuFormats,
    menuSelectedFormat,
    isFavorite,
  ])

  const hasMenu =
    computedMenuActions && computedMenuActions.length > 0 && onMenuAction

  const handlePress = useCallback(() => {
    if (isAnyMenuOpen || !onPress) return
    if (!canStartReaderOpenTransition(downloadStatus, menuIsRemote)) {
      onPress(book.id)
      return
    }
    const coverNode = coverRef.current
    if (!coverNode) {
      onPress(book.id)
      return
    }

    measureReaderTransitionFrame(
      coverNode,
      { borderRadius: COVER_BORDER_RADIUS },
      async ({ frame, screenWidth, screenHeight, rootX, rootY }) => {
        await startReaderOpenTransition({
          bookId: book.id,
          format: book.readingFormat,
          coverUri: book.coverUri,
          title: book.title,
          frame,
          screenWidth,
          screenHeight,
          rootX,
          rootY,
        })
        requestAnimationFrame(() => onPress(book.id))
      },
    )
  }, [
    book.coverUri,
    book.id,
    book.readingFormat,
    book.title,
    downloadStatus,
    isAnyMenuOpen,
    menuIsRemote,
    onPress,
  ])

  const handleMenuOpenLocal = useCallback(() => {
    onMenuOpen?.(book.id)
  }, [book.id, onMenuOpen])

  const handleMenuPressAction = useCallback(
    ({ nativeEvent }: { nativeEvent: { event: string } }) => {
      onMenuAction?.(book.id, nativeEvent.event)
    },
    [book.id, onMenuAction],
  )

  const menuTrigger = (
    <View
      accessibilityRole="button"
      accessibilityLabel={t("bookDetail.moreActions", { title: book.title })}
      className="h-8 w-8 items-center justify-center"
    >
      <MoreActionsIcon size={ICON_SIZE.base} color={palette.textMuted} />
    </View>
  )

  const cardContent = (
    <View className="flex-row items-center gap-3 p-3">
      <RNView ref={coverRef} collapsable={false}>
        <BookCover
          book={book}
          width={COVER_WIDTH}
          height={COVER_HEIGHT}
          borderRadius={COVER_BORDER_RADIUS}
          thumbnailScopeKey={thumbnailScopeKey}
        />
      </RNView>
      <View className="min-w-0 flex-1 justify-center gap-1">
        <Text
          className="text-base font-bold"
          style={{ color: palette.text }}
          numberOfLines={1}
        >
          {book.title}
        </Text>
        <Text
          className="text-sm"
          style={{ color: palette.textMuted }}
          numberOfLines={1}
        >
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
        <View className="h-8 w-8" />
      ) : (
        <View
          accessibilityRole="button"
          accessibilityLabel={t("bookDetail.moreActions", {
            title: book.title,
          })}
          className="h-8 w-8 items-center justify-center"
        >
          <MoreActionsIcon size={ICON_SIZE.base} color={palette.textMuted} />
        </View>
      )}
    </View>
  )

  return (
    <View
      className="overflow-hidden rounded-2xl shadow-lg"
      style={{
        width,
        backgroundColor: palette.surface,
        borderColor: palette.border,
        borderWidth: 1,
      }}
    >
      <CoverAdaptiveBackground
        coverUri={displayCoverUri}
        rawColors={coverRawColors}
        colorScheme={resolvedScheme}
        variant={homeCardStyle}
      />
      <Pressable
        accessibilityRole={onPress ? "button" : undefined}
        accessibilityLabel={t("bookDetail.openBook", { title: book.title })}
        onPress={handlePress}
        android_ripple={{
          color: androidRippleColor(resolvedScheme, palette),
          foreground: true,
        }}
        style={({ pressed }) => ({
          overflow: "hidden",
          backgroundColor:
            Platform.OS === "ios" && pressed
              ? pressedBackgroundColor(resolvedScheme, palette)
              : undefined,
        })}
      >
        {cardContent}
      </Pressable>
      {hasMenu ? (
        <MenuView
          actions={computedMenuActions}
          isAnchoredToRight={Platform.OS === "android"}
          onOpenMenu={handleMenuOpenLocal}
          onCloseMenu={onMenuClose}
          onPressAction={handleMenuPressAction}
          style={{
            position: "absolute",
            top: 12 + (COVER_HEIGHT - 32) / 2,
            right: 12,
          }}
        >
          {menuTrigger}
        </MenuView>
      ) : null}
    </View>
  )
}

/**
 * Compact horizontal reading card: cover + title/author/progress + more menu.
 */
export const ReadingListCard = memo(ReadingListCardImpl)
