import {
  Profiler,
  memo,
  useCallback,
  useMemo,
  useRef,
  type ProfilerOnRenderCallback,
  type ReactNode,
} from "react"

import { MenuView, type MenuAction } from "@react-native-menu/menu"
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type TextStyle,
  type ViewStyle,
} from "react-native"

import { ICON_SIZE } from "@/src/design/icon-sizes"
import type { BookCoverUri, BookItem } from "@/src/domain/types"
import {
  canStartReaderOpenTransition,
  measureReaderTransitionFrame,
  startReaderOpenTransition,
} from "@/src/features/reader/reader-open-transition"
import { buildBookMenuActions } from "../../utils/book-menu"

import { MoreActionsIcon } from "@/src/components/ui/more-actions-icon"
import {
  BookCoverBase,
  type BookDownloadStatus,
  type BookProgressSnapshot,
} from "./book-cover"
import { BookDownloadStatusIndicatorBase } from "@/src/components/book-download-status-indicator"
import {
  ProgressLabelBase,
  type ProgressLabelColors,
  type ProgressLabelLabels,
} from "./progress-label"

export type BookCardChrome = {
  coverBackgroundColor: string
  coverShadowColor: string
  progressColors: ProgressLabelColors
  progressLabels: ProgressLabelLabels
  surfaceColor: string
  textColor: string
  textMutedColor: string
}

export type BookCardProps = {
  book: BookItem
  width: number
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
  profilerOnRender?: ProfilerOnRenderCallback
  chrome: BookCardChrome
  moreActionsLabel: string
  openBookLabel?: string
}

export function getBookCardCoverHeight(width: number) {
  return Math.round(width * 1.43)
}

// The iPad grid can mount/update dozens of cards per scroll commit. This hot
// path uses RN primitives + StyleSheet instead of `@/tw` so NativeWind parsing,
// theme context reads, and i18n hooks stay outside recycled cells.
function BookCardImpl({
  book,
  width,
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
  menuIsRemote,
  menuFormats,
  menuSelectedFormat,
  isFavorite,
  subscriptionLibraryId,
  subscriptionFormat,
  profilerOnRender,
  chrome,
  moreActionsLabel,
  openBookLabel,
}: BookCardProps) {
  const coverHeight = getBookCardCoverHeight(width)
  const coverRef = useRef<View>(null)
  const cardRootStyle: ViewStyle = { width }
  const titleTextStyle: TextStyle = { color: chrome.textColor }

  const showCloudIcon = downloadStatus === "notDownloaded"
  const showProgressIndicator = downloadStatus === "downloading"

  const hasMenuInputs = menuIsRemote !== undefined
  const computedMenuActions = useMemo<MenuAction[] | undefined>(() => {
    // Grid cells receive precomputed menu actions from the parent; keep this
    // fallback only for non-grid callers so scrolling does not rebuild arrays.
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
    (event: GestureResponderEvent) => {
      event.stopPropagation()
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
      accessibilityLabel={moreActionsLabel}
      style={styles.actionButton}
      onPress={handleMorePress}
    >
      <MoreActionsIcon size={ICON_SIZE.base} color={chrome.textMutedColor} />
    </Pressable>
  )

  const menuTrigger = (
    <View
      accessibilityRole="button"
      accessibilityLabel={moreActionsLabel}
      style={styles.actionButton}
    >
      <MoreActionsIcon size={ICON_SIZE.base} color={chrome.textMutedColor} />
    </View>
  )

  const profileSegment = (id: string, children: ReactNode) =>
    profilerOnRender ? (
      <Profiler id={id} onRender={profilerOnRender}>
        {children}
      </Profiler>
    ) : (
      children
    )

  // Grid scrolling spends visible time in CoreAnimation/UIKit work; keep
  // decorative shadows for non-list cover surfaces instead.
  const coverSegment = (
    <Pressable
      ref={coverRef}
      collapsable={false}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={openBookLabel}
      onPress={handlePress}
      style={styles.coverPressable}
    >
      <BookCoverBase
        book={book}
        width={width}
        height={coverHeight}
        borderRadius={10}
        displayCoverUri={displayCoverUri}
        deferCoverUntilDisplayUri={deferCoverUntilDisplayUri}
        shadowEnabled={false}
        thumbnailScopeKey={thumbnailScopeKey}
        backgroundColor={chrome.coverBackgroundColor}
        shadowColor={chrome.coverShadowColor}
        skeletonColor={chrome.surfaceColor}
      />
    </Pressable>
  )

  const titleSegment = (
    <View style={styles.titleRow}>
      <Text
        style={[styles.titleText, titleTextStyle]}
        numberOfLines={1}
        maxFontSizeMultiplier={1.3}
      >
        {book.title}
      </Text>
    </View>
  )

  const progressSegment = (
    <View style={styles.progressSlot}>
      <ProgressLabelBase
        progress={progress}
        colors={chrome.progressColors}
        labels={chrome.progressLabels}
      />
    </View>
  )

  const actionsSegment = (
    <View style={styles.actionsRow}>
      {showCloudIcon || showProgressIndicator ? (
        <BookDownloadStatusIndicatorBase
          status={downloadStatus}
          libraryId={subscriptionLibraryId}
          bookId={book.id}
          format={subscriptionFormat}
          fallbackProgress={downloadProgress}
          cloudColor={chrome.textMutedColor}
          progressColor={chrome.progressColors.primary}
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
            isAnchoredToRight
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
  )

  return (
    <View style={cardRootStyle}>
      {profileSegment("BookCard.cover", coverSegment)}
      {profileSegment("BookCard.title", titleSegment)}
      <View style={styles.metaRow}>
        {profileSegment("BookCard.progress", progressSegment)}
        {profileSegment("BookCard.actions", actionsSegment)}
      </View>
    </View>
  )
}

/**
 * Renders the mobile cover-first book card.
 */
export const BookCard = memo(BookCardImpl)

const styles = StyleSheet.create({
  actionButton: {
    alignItems: "center",
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  actionsRow: {
    alignItems: "center",
    flexDirection: "row",
  },
  coverPressable: {
    borderRadius: 10,
  },
  metaRow: {
    alignItems: "center",
    flexDirection: "row",
  },
  progressSlot: {
    flex: 1,
  },
  titleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    marginTop: 8,
  },
  titleText: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
  },
})
