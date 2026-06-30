import { memo, useCallback, useMemo, useRef } from "react"

import { MenuView, type MenuAction } from "@react-native-menu/menu"
import { useTranslation } from "react-i18next"
import { Platform, View as RNView } from "react-native"

import { useThemePalette } from "@/src/design/tokens"
import { ICON_SIZE } from "@/src/design/icon-sizes"
import type { BookItem } from "@/src/domain/types"
import {
  canStartReaderOpenTransition,
  measureReaderTransitionFrame,
  startReaderOpenTransition,
} from "@/src/features/reader/reader-open-transition"
import { Pressable, Text, TouchableHighlight, View } from "@/tw"
import { buildBookMenuActions } from "../../utils/book-menu"

import { MoreActionsIcon } from "@/src/components/ui/more-actions-icon"
import {
  BookCover,
  type BookDownloadStatus,
  type BookProgressSnapshot,
} from "./book-cover"
import { BookDownloadStatusIndicator } from "@/src/components/book-download-status-indicator"
import { ProgressLabel } from "./progress-label"

export type BookCardProps = {
  book: BookItem
  width: number
  /**
   * Handlers receive `bookId` so the parent can keep a single stable callback
   * across all cells, which lets React.memo short-circuit cell renders.
   */
  onPress?: (bookId: string) => void
  onMore?: (bookId: string) => void
  menuActions?: MenuAction[]
  onMenuAction?: (bookId: string, actionId: string) => void
  onMenuOpen?: (bookId: string) => void
  onMenuClose?: () => void
  isAnyMenuOpen?: boolean
  progress?: BookProgressSnapshot
  readerFormat?: string
  downloadStatus?: BookDownloadStatus
  downloadProgress?: number
  /**
   * Primitive menu inputs let the card build its own actions while keeping
   * `React.memo` shallow comparison cheap. Passing a single `menuConfig` object
   * would defeat memoization because the parent reallocates the object whenever
   * any of these fields change.
   */
  menuIsRemote?: boolean
  menuFormats?: string[]
  menuSelectedFormat?: string
  isFavorite?: boolean
  /**
   * When set together, the card subscribes directly to the download store for
   * this book+format so progress updates do not re-render the parent list.
   * Falls back to `downloadProgress` when not set.
   */
  subscriptionLibraryId?: string
  subscriptionFormat?: string
}

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
  readerFormat,
  downloadStatus,
  downloadProgress,
  menuIsRemote,
  menuFormats,
  menuSelectedFormat,
  isFavorite,
  subscriptionLibraryId,
  subscriptionFormat,
}: BookCardProps) {
  const { t } = useTranslation()
  const palette = useThemePalette()
  const coverHeight = Math.round(width * 1.43)
  const coverRef = useRef<RNView>(null)

  const showCloudIcon = downloadStatus === "notDownloaded"
  const showProgressIndicator = downloadStatus === "downloading"

  const hasMenuInputs = menuIsRemote !== undefined
  const computedMenuActions = useMemo<MenuAction[] | undefined>(() => {
    if (!hasMenuInputs) return menuActions
    return buildBookMenuActions(downloadStatus, {
      isRemote: menuIsRemote ?? false,
      isFavorite,
      formats: menuFormats,
      selectedFormat: menuSelectedFormat,
    })
  }, [
    downloadStatus,
    hasMenuInputs,
    menuActions,
    menuFormats,
    menuIsRemote,
    menuSelectedFormat,
    isFavorite,
  ])

  const hasMenu =
    (computedMenuActions && computedMenuActions.length > 0 && onMenuAction) ||
    onMore

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
      { borderRadius: 10 },
      async ({ frame, screenWidth, screenHeight, rootX, rootY }) => {
        await startReaderOpenTransition({
          bookId: book.id,
          format: readerFormat,
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
    book.title,
    downloadStatus,
    isAnyMenuOpen,
    menuIsRemote,
    onPress,
    readerFormat,
  ])

  const handleMorePress = useCallback(
    (event: { stopPropagation?: () => void }) => {
      event.stopPropagation?.()
      onMore?.(book.id)
    },
    [book.id, onMore],
  )

  const handleMenuOpenLocal = useCallback(() => {
    onMenuOpen?.(book.id)
  }, [book.id, onMenuOpen])

  const handleMenuPressAction = useCallback(
    ({ nativeEvent }: { nativeEvent: { event: string } }) => {
      onMenuAction?.(book.id, nativeEvent.event)
    },
    [book.id, onMenuAction],
  )

  const moreButton = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("bookDetail.moreActions", { title: book.title })}
      className="h-8 w-8 items-center justify-center"
      style={Platform.OS === "ios" ? { marginLeft: -2 } : undefined}
      onPress={handleMorePress}
    >
      <MoreActionsIcon size={ICON_SIZE.base} color={palette.textMuted} />
    </Pressable>
  )

  const menuTrigger = (
    <View
      accessibilityRole="button"
      accessibilityLabel={t("bookDetail.moreActions", { title: book.title })}
      className="h-8 w-8 items-center justify-center"
      style={Platform.OS === "ios" ? { marginLeft: -2 } : undefined}
    >
      <MoreActionsIcon size={ICON_SIZE.base} color={palette.textMuted} />
    </View>
  )

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
          <RNView ref={coverRef} collapsable={false}>
            <BookCover
              book={book}
              width={width}
              height={coverHeight}
              borderRadius={10}
            />
          </RNView>
        </TouchableHighlight>
      </View>
      <View className="mt-2 flex-row items-center gap-1.5">
        <Text
          className="flex-1 text-base font-semibold"
          style={{ color: palette.text }}
          numberOfLines={1}
        >
          {book.title}
        </Text>
      </View>
      <View className="flex-row items-center">
        <View className="flex-1">
          <ProgressLabel progress={progress} />
        </View>
        <View className="flex-row items-center">
          {showCloudIcon || showProgressIndicator ? (
            <BookDownloadStatusIndicator
              status={downloadStatus}
              libraryId={subscriptionLibraryId}
              bookId={book.id}
              format={subscriptionFormat}
              fallbackProgress={downloadProgress}
            />
          ) : null}
          {hasMenu ? (
            computedMenuActions && onMenuAction ? (
              <MenuView
                key={
                  computedMenuActions.some(
                    (a) =>
                      (a.id === "share" || a.id?.startsWith("share:")) &&
                      !a.attributes?.disabled,
                  )
                    ? "share-enabled"
                    : "share-disabled"
                }
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
    </View>
  )
}

/**
 * Renders the mobile cover-first book card.
 */
export const BookCard = memo(BookCardImpl)
