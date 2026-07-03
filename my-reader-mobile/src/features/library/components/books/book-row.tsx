import { memo, useCallback, useMemo, useRef } from "react"

import { MenuView, type MenuAction } from "@react-native-menu/menu"
import { useTranslation } from "react-i18next"
import { Platform, View as RNView } from "react-native"

import { useThemePalette } from "@/src/design/tokens"
import { ICON_SIZE } from "@/src/design/icon-sizes"
import type { BookCoverUri, BookItem } from "@/src/domain/types"
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

/** Cover size constants for the list row. Adjust height and border radius here; width is derived from a standard 2:3 book cover ratio. */
export const BOOK_ROW_COVER_HEIGHT = 84
const BOOK_ROW_COVER_BORDER_RADIUS = 4
const BOOK_ROW_COVER_ASPECT_RATIO = 2 / 3
export const BOOK_ROW_COVER_WIDTH = Math.round(
  BOOK_ROW_COVER_HEIGHT * BOOK_ROW_COVER_ASPECT_RATIO,
)

export type BookRowProps = {
  book: BookItem
  displayCoverUri?: BookCoverUri
  deferCoverUntilDisplayUri?: boolean
  thumbnailScopeKey?: string
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
  horizontalPadding?: number
  /**
   * Primitive menu inputs let the row build its own actions while keeping
   * `React.memo` shallow comparison cheap. Passing a single `menuConfig` object
   * would defeat memoization because the parent reallocates the object whenever
   * any of these fields change.
   */
  menuIsRemote?: boolean
  menuFormats?: string[]
  menuSelectedFormat?: string
  isFavorite?: boolean
  /**
   * When set together, the row subscribes directly to the download store for
   * this book+format so progress updates do not re-render the parent list.
   * Falls back to `downloadProgress` when not set.
   */
  subscriptionLibraryId?: string
  subscriptionFormat?: string
}

function BookRowImpl({
  book,
  displayCoverUri,
  deferCoverUntilDisplayUri,
  thumbnailScopeKey,
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
  horizontalPadding = 16,
  menuIsRemote,
  menuFormats,
  menuSelectedFormat,
  isFavorite,
  subscriptionLibraryId,
  subscriptionFormat,
}: BookRowProps) {
  const { t } = useTranslation()
  const palette = useThemePalette()
  const coverRef = useRef<RNView>(null)

  const showCloudIcon = downloadStatus === "notDownloaded"
  const showProgressIndicator = downloadStatus === "downloading"

  const hasMenuInputs = menuIsRemote !== undefined
  const computedMenuActions = useMemo<MenuAction[] | undefined>(() => {
    // Prefer parent-precomputed actions so list/grid rows avoid rebuilding
    // native menu arrays when FlashList recycles visible cells.
    if (menuActions) return menuActions
    if (!hasMenuInputs) return undefined
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
      { borderRadius: BOOK_ROW_COVER_BORDER_RADIUS },
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
    <TouchableHighlight
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={t("bookDetail.openBook", { title: book.title })}
      onPress={handlePress}
      underlayColor={palette.surface}
    >
      <View
        className="flex-row items-stretch gap-3.5 border-b py-2.5"
        style={{
          borderColor: palette.border,
          paddingHorizontal: horizontalPadding,
        }}
      >
        <RNView ref={coverRef} collapsable={false}>
          <BookCover
            book={book}
            width={BOOK_ROW_COVER_WIDTH}
            height={BOOK_ROW_COVER_HEIGHT}
            borderRadius={BOOK_ROW_COVER_BORDER_RADIUS}
            displayCoverUri={displayCoverUri}
            deferCoverUntilDisplayUri={deferCoverUntilDisplayUri}
            thumbnailScopeKey={thumbnailScopeKey}
          />
        </RNView>
        <View className="min-w-0 flex-1 justify-between">
          <View className="gap-0.5">
            <Text
              className="text-base font-semibold"
              style={{ color: palette.text }}
              numberOfLines={1}
            >
              {book.title}
            </Text>
            <Text
              className="text-base"
              style={{ color: palette.textMuted }}
              numberOfLines={1}
            >
              {book.author}
            </Text>
          </View>
          <View className="gap-1">
            <View className="flex-row flex-wrap items-center gap-1.5">
              <ProgressLabel progress={progress} />
              <View className="ml-auto flex-row items-center">
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
                    <View onStartShouldSetResponder={() => true}>
                      <MenuView
                        key={
                          computedMenuActions.some(
                            (a) =>
                              (a.id === "share" ||
                                a.id?.startsWith("share:")) &&
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
                    </View>
                  ) : (
                    moreButton
                  )
                ) : null}
              </View>
            </View>
          </View>
        </View>
      </View>
    </TouchableHighlight>
  )
}

/**
 * Renders the mobile list row for a book.
 */
export const BookRow = memo(BookRowImpl)
