import {
  Profiler,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from "react"

import MaterialIcons from "@expo/vector-icons/MaterialIcons"
import {
  FlashList,
  type ListRenderItemInfo,
  type ViewToken,
} from "@shopify/flash-list"
import { Stack, router, useIsFocused } from "expo-router"
import { useTranslation } from "react-i18next"
import { View, useWindowDimensions, type ViewabilityConfig } from "react-native"

import { showAlertWithStatusBarRestore } from "@/src/constants/alert-with-status-bar"
import {
  DEVELOPER_TOOLS_ENABLED,
  LIBRARY_CARD_SEGMENT_PROFILER_ENABLED,
} from "@/src/constants/developer-tools"
import { useThemePalette } from "@/src/design/tokens"

import {
  EmptyState,
  PrimaryButton,
  RoundIconButton,
  Screen,
} from "@/src/components"
import { switchActiveLibrary } from "@/src/domain/library/hooks/library-actions"
import { useBookReadingFormat } from "@/src/domain/library/hooks/use-book-reading-format"
import { useFavoriteBooks } from "@/src/domain/library/hooks/use-favorite-books"
import { notifyLibraryRefresh } from "@/src/domain/notifications/download-notifications"
import { useSyncLibrary } from "@/src/domain/sync/hooks/use-sync-library"
import type { BookItem } from "@/src/domain/types"
import { isRemoteSourceType } from "@/src/domain/types"
import {
  BookCard,
  BookRow,
  LibrarySkeletonContent,
  type BookCardChrome,
} from "@/src/features/library/components/books"
import { getBookCardCoverHeight } from "@/src/features/library/components/books/book-card"
import {
  BOOK_ROW_COVER_HEIGHT,
  BOOK_ROW_COVER_WIDTH,
} from "@/src/features/library/components/books/book-row"
import {
  useBookFilter,
  type LibraryFilterOption,
  type SortOption,
} from "@/src/features/library/hooks/use-book-filter"
import { useBookReadingProgress } from "@/src/domain/library/hooks/use-book-reading-progress"
import { useLibraryHeaderChrome } from "@/src/features/library/hooks/use-library-header-chrome"
import { useLibraryListPerformanceProfiler } from "@/src/features/library/hooks/use-library-list-performance-profiler"
import { useSearchQuery } from "@/src/features/library/hooks/use-search-query"
import { useCoverThumbnails } from "@/src/features/library/hooks/use-cover-thumbnails"
import { useBooks } from "@/src/features/library/hooks/useLibraryQuery"
import {
  resolveCoverThumbnailBookIds,
  resolveInitialCoverThumbnailBookIds,
} from "@/src/features/library/utils/cover-thumbnail-window"
import { buildLibraryBookCellMetaById } from "@/src/features/library/utils/library-book-cell-meta"
import { resolveLibraryScreenVariant } from "@/src/features/library/utils/resolve-library-screen-variant"
import { useLibraryBookMeta } from "@/src/hooks/use-library-book-meta"
import { useAppStore } from "@/src/store/app-store"
import { useBookActions } from "./hooks/use-book-actions"

const defaultSortOption: SortOption = "recentlyAdded"

/** Grid layout constants. Adjust these to tune the grid's horizontal margins and gutters.
 *
 * - GRID_PADDING_X: horizontal space between the screen edge and the outermost cards.
 * - GRID_CARD_GAP: space between adjacent cards (both rows and columns).
 *   Each card wrapper gets GRID_CARD_GAP / 2 of horizontal padding so that two
 *   neighboring wrappers together form the full gap; FlashList's content padding
 *   is reduced by the same half-gap to keep the outer edge flush with GRID_PADDING_X.
 */
const GRID_MIN_CARD_WIDTH = 150
const GRID_MIN_COLUMNS = 2
const GRID_MAX_COLUMNS = 6
const GRID_PADDING_X = 16
const GRID_CARD_GAP = 12
const GRID_DRAW_DISTANCE_ROWS = 2
const GRID_CARD_META_HEIGHT = 64
const LIST_DRAW_DISTANCE_ROWS = 4
const LIST_ROW_ESTIMATED_HEIGHT = 108
const LIST_PADDING_X = GRID_PADDING_X
const COVER_THUMBNAIL_INITIAL_GRID_ROWS = 4
const COVER_THUMBNAIL_INITIAL_LIST_ITEMS = 10
const COVER_THUMBNAIL_DISPLAY_LOOKAROUND_GRID_ROWS = 2
const COVER_THUMBNAIL_DISPLAY_LOOKAROUND_LIST_ITEMS = 6
const COVER_THUMBNAIL_INITIAL_IDLE_DELAY_MS = 80
const COVER_THUMBNAIL_SCROLL_QUIET_DELAY_MS = 500
const DISABLED_MAINTAIN_VISIBLE_CONTENT_POSITION = { disabled: true }
const GRID_CELL_CONTAINER_STYLE = { paddingHorizontal: GRID_CARD_GAP / 2 }
const COVER_THUMBNAIL_VIEWABILITY_CONFIG: ViewabilityConfig = {
  itemVisiblePercentThreshold: 1,
  minimumViewTime: 80,
}

type LibraryScreenProps = {
  libraryId?: string
}

/** Computes responsive grid columns so larger screens can show more books per row. */
function getResponsiveGridColumns(
  containerWidth: number,
  gap: number,
  horizontalPadding: number,
): number {
  const availableWidth = Math.max(0, containerWidth - horizontalPadding * 2)
  const estimatedColumns = Math.floor(
    (availableWidth + gap) / (GRID_MIN_CARD_WIDTH + gap),
  )
  return Math.max(
    GRID_MIN_COLUMNS,
    Math.min(GRID_MAX_COLUMNS, estimatedColumns || GRID_MIN_COLUMNS),
  )
}

function getInitialCoverThumbnailItemCount(
  isGridView: boolean,
  gridColumns: number,
): number {
  return isGridView
    ? gridColumns * COVER_THUMBNAIL_INITIAL_GRID_ROWS
    : COVER_THUMBNAIL_INITIAL_LIST_ITEMS
}

function getCoverThumbnailDisplayLookaroundItemCount(
  isGridView: boolean,
  gridColumns: number,
): number {
  return isGridView
    ? gridColumns * COVER_THUMBNAIL_DISPLAY_LOOKAROUND_GRID_ROWS
    : COVER_THUMBNAIL_DISPLAY_LOOKAROUND_LIST_ITEMS
}

function getInitialCoverThumbnailDisplayItemCount(
  isGridView: boolean,
  gridColumns: number,
): number {
  return (
    getInitialCoverThumbnailItemCount(isGridView, gridColumns) +
    getCoverThumbnailDisplayLookaroundItemCount(isGridView, gridColumns)
  )
}

function getLibraryListDrawDistance(isGridView: boolean, cardWidth: number) {
  if (!isGridView) {
    return LIST_ROW_ESTIMATED_HEIGHT * LIST_DRAW_DISTANCE_ROWS
  }

  // `drawDistance` is FlashList's offscreen render buffer. Keep it large enough
  // to pre-mount the next couple of grid rows so fast scrolling does not reveal
  // blank space, but do not expand thumbnail generation beyond visible cells.
  const gridRowHeight =
    getBookCardCoverHeight(cardWidth) + GRID_CARD_META_HEIGHT + GRID_CARD_GAP
  return Math.round(gridRowHeight * GRID_DRAW_DISTANCE_ROWS)
}

function sameStringSet(left: Set<string>, right: Set<string>): boolean {
  if (left.size !== right.size) return false
  for (const value of left) {
    if (!right.has(value)) return false
  }
  return true
}

type LibraryItemSeparator = NonNullable<
  ComponentProps<typeof FlashList<BookItem>>["ItemSeparatorComponent"]
>

const SeparatorGrid = memo(function SeparatorGrid() {
  return <View style={{ height: GRID_CARD_GAP }} />
}) as LibraryItemSeparator
const SeparatorList = memo(function SeparatorList() {
  return null
}) as LibraryItemSeparator

export default function LibraryScreen({
  libraryId: libraryIdProp,
}: LibraryScreenProps) {
  const { t } = useTranslation()
  const palette = useThemePalette()
  const isLibraryFocused = useIsFocused()
  const { width } = useWindowDimensions()
  const gridColumns = getResponsiveGridColumns(
    width,
    GRID_CARD_GAP,
    GRID_PADDING_X,
  )
  const cardWidth =
    (width - GRID_PADDING_X * 2 - GRID_CARD_GAP * (gridColumns - 1)) /
    gridColumns
  const { switchLibrary } = { switchLibrary: switchActiveLibrary }
  const libraries = useAppStore((s) => s.libraries)
  const activeLibraryId = useAppStore((s) => s.activeLibraryId)
  const storeReady = useAppStore((s) => s.storeReady)
  const effectiveLibraryId = libraryIdProp ?? activeLibraryId ?? undefined
  const {
    data: books = [],
    isLoading: loadingBooks,
    error: booksError,
  } = useBooks(activeLibraryId)
  const { syncNow } = useSyncLibrary()
  const viewMode = useAppStore((s) => s.libraryViewMode)
  const setViewMode = useAppStore((s) => s.setLibraryViewMode)
  const libraryPerformanceProfilerEnabled = useAppStore(
    (s) => s.settings.libraryPerformanceProfilerEnabled,
  )
  const { query, setQuery, debouncedQuery, clearQuery } =
    useSearchQuery(effectiveLibraryId)
  const [sortBy, setSortBy] = useState<SortOption>(defaultSortOption)
  const [filter, setFilter] = useState<LibraryFilterOption>("all")
  const isGridView = viewMode === "grid"
  const listDrawDistance = getLibraryListDrawDistance(isGridView, cardWidth)

  const [openMenuBookId, setOpenMenuBookId] = useState<string | null>(null)
  const menuCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scrollIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const thumbnailWorkPausedRef = useRef(true)
  const [thumbnailWorkPaused, setThumbnailWorkPaused] = useState(true)

  const isLoadingNewContent = loadingBooks && books.length === 0

  const handleMenuOpen = useCallback((bookId: string) => {
    if (menuCloseTimerRef.current) {
      clearTimeout(menuCloseTimerRef.current)
      menuCloseTimerRef.current = null
    }
    setOpenMenuBookId(bookId)
  }, [])

  const handleMenuClose = useCallback(() => {
    menuCloseTimerRef.current = setTimeout(() => {
      setOpenMenuBookId(null)
      menuCloseTimerRef.current = null
    }, 120)
  }, [])

  useEffect(
    () => () => {
      if (scrollIdleTimerRef.current) {
        clearTimeout(scrollIdleTimerRef.current)
      }
    },
    [],
  )

  const setThumbnailWorkPausedState = useCallback((paused: boolean) => {
    thumbnailWorkPausedRef.current = paused
    setThumbnailWorkPaused(paused)
  }, [])

  /** Switches active library only when user selects a different one. */
  const applyLibrarySelection = useCallback(
    (nextLibraryId: string) => {
      if (nextLibraryId === effectiveLibraryId) return
      void switchLibrary(nextLibraryId)
    },
    [effectiveLibraryId, switchLibrary],
  )

  const selectedLibrary = useMemo(
    () =>
      effectiveLibraryId
        ? (libraries.find((library) => library.id === effectiveLibraryId) ??
          null)
        : null,
    [libraries, effectiveLibraryId],
  )

  const { selectedFormatById, setBookReadingFormat } =
    useBookReadingFormat(selectedLibrary)
  const { favoriteSet, toggleFavorite } = useFavoriteBooks(
    selectedLibrary,
    books,
  )

  const variant = resolveLibraryScreenVariant({
    storeReady,
    effectiveLibraryId,
    hasSelectedLibrary: selectedLibrary !== null,
    librariesCount: libraries.length,
  })

  const {
    bookFormatsById,
    bookFormatMetaById,
    fileStateBundle,
    bookDownloadStatusById,
    bookActiveFormatsById,
  } = useLibraryBookMeta(selectedLibrary, books, selectedFormatById)
  const { data: progressByBookId } = useBookReadingProgress(selectedLibrary)
  const { visibleBooks } = useBookFilter(
    books,
    debouncedQuery,
    sortBy,
    filter,
    bookDownloadStatusById,
    favoriteSet,
  )
  const isRemote = isRemoteSourceType(selectedLibrary?.sourceType)
  const selectedLibraryId = selectedLibrary?.id
  const [coverThumbnailDisplayBookIds, setCoverThumbnailDisplayBookIds] =
    useState<Set<string>>(() => new Set())
  const [coverThumbnailGenerationBookIds, setCoverThumbnailGenerationBookIds] =
    useState<Set<string>>(() => new Set())
  const coverThumbnailLayout = useMemo(
    () =>
      isGridView
        ? { width: cardWidth, height: getBookCardCoverHeight(cardWidth) }
        : { width: BOOK_ROW_COVER_WIDTH, height: BOOK_ROW_COVER_HEIGHT },
    [cardWidth, isGridView],
  )
  const visibleBookById = useMemo(() => {
    const next = new Map<string, BookItem>()
    for (const book of visibleBooks) {
      next.set(book.id, book)
    }
    return next
  }, [visibleBooks])
  const coverThumbnailDisplayBooks = useMemo(() => {
    const next: BookItem[] = []
    for (const bookId of coverThumbnailDisplayBookIds) {
      const book = visibleBookById.get(bookId)
      if (book) {
        next.push(book)
      }
    }
    return next
  }, [coverThumbnailDisplayBookIds, visibleBookById])
  const displayCoverUriByBookId = useCoverThumbnails({
    enabled: isLibraryFocused,
    generationBookIds: coverThumbnailGenerationBookIds,
    paused: thumbnailWorkPaused,
    library: selectedLibrary,
    books: coverThumbnailDisplayBooks,
    width: coverThumbnailLayout.width,
    height: coverThumbnailLayout.height,
  })
  // FlashList may render dozens of cells in one commit on iPad. Build the
  // expensive per-book labels/actions/progress once per data change, not inside
  // `renderItem`, so the scroll commit mostly passes stable references through.
  const bookCellMetaById = useMemo(
    () =>
      buildLibraryBookCellMetaById({
        bookActiveFormatsById,
        bookDownloadStatusById,
        bookFormatMetaById,
        bookFormatsById,
        favoriteSet,
        isRemote,
        progressByBookId,
        selectedFormatById,
        selectedLibraryId,
        translate: t,
        visibleBooks,
      }),
    [
      bookActiveFormatsById,
      bookDownloadStatusById,
      bookFormatMetaById,
      bookFormatsById,
      favoriteSet,
      isRemote,
      progressByBookId,
      selectedFormatById,
      selectedLibraryId,
      t,
      visibleBooks,
    ],
  )
  const bookCardChrome = useMemo<BookCardChrome>(
    () => ({
      coverBackgroundColor: palette.backgroundSecondary,
      coverShadowColor: palette.text,
      progressColors: {
        primary: palette.primary,
        success: palette.success,
        successSoft: palette.successSoft,
        surface: palette.surface,
        textMuted: palette.textMuted,
      },
      progressLabels: {
        finished: t("bookRow.finished"),
        unread: t("bookRow.unread"),
      },
      surfaceColor: palette.surface,
      textColor: palette.text,
      textMutedColor: palette.textMuted,
    }),
    [
      palette.backgroundSecondary,
      palette.primary,
      palette.success,
      palette.successSoft,
      palette.surface,
      palette.text,
      palette.textMuted,
      t,
    ],
  )
  const isLibraryProfilerEnabled =
    DEVELOPER_TOOLS_ENABLED && libraryPerformanceProfilerEnabled
  const {
    onCommitLayoutEffect,
    onLoad,
    onRender,
    onRenderSegment,
    recordRenderTarget,
  } = useLibraryListPerformanceProfiler({
    enabled: isLibraryProfilerEnabled,
    libraryId: selectedLibraryId,
    viewMode,
    totalBooks: books.length,
    visibleBooks: visibleBooks.length,
  })
  const cardSegmentProfilerOnRender = LIBRARY_CARD_SEGMENT_PROFILER_ENABLED
    ? onRenderSegment
    : undefined

  /** Opens a platform-neutral library picker menu without navigation. */
  const openLibrarySwitchMenu = useCallback(() => {
    showAlertWithStatusBarRestore(
      t("library.switchLibrary"),
      t("library.switchLibraryAlert.message", {
        name:
          selectedLibrary?.name ?? t("library.switchLibraryAlert.unselected"),
      }),
      [
        ...libraries.map((library) => ({
          text: `${effectiveLibraryId === library.id ? "✓ " : ""}${library.name}`,
          onPress: () => applyLibrarySelection(library.id),
        })),
        { text: t("library.switchLibraryAlert.close"), style: "cancel" },
      ],
    )
  }, [applyLibrarySelection, effectiveLibraryId, libraries, selectedLibrary, t])

  const handleSyncCurrentLibrary = useCallback(() => {
    if (!selectedLibrary) return
    void (async () => {
      try {
        await syncNow(selectedLibrary.id)
        notifyLibraryRefresh("done")
      } catch (e) {
        console.error("[library-screen] sync library failed:", e)
        notifyLibraryRefresh(
          "error",
          e instanceof Error ? e.message : undefined,
        )
      }
    })()
  }, [selectedLibrary, syncNow])

  const { options, toolbar } = useLibraryHeaderChrome({
    variant,
    selectedLibrary,
    libraries,
    effectiveLibraryId,
    filter,
    sortBy,
    viewMode,
    onSyncCurrentLibrary: handleSyncCurrentLibrary,
    onSelectLibrary: applyLibrarySelection,
    onOpenLibrarySwitchMenu: openLibrarySwitchMenu,
    onSetFilter: setFilter,
    onSetSortBy: setSortBy,
    onSetViewMode: setViewMode,
    onQueryChange: setQuery,
    onSearchCancel: clearQuery,
  })

  useEffect(() => {
    if (
      !libraryIdProp ||
      !selectedLibrary ||
      libraryIdProp === activeLibraryId
    ) {
      return
    }

    void switchLibrary(libraryIdProp)
  }, [activeLibraryId, libraryIdProp, selectedLibrary, switchLibrary])

  const { handleBookPress, handleBookMenuAction } = useBookActions(
    books,
    bookDownloadStatusById,
    bookFormatMetaById,
    fileStateBundle,
    openMenuBookId,
    selectedFormatById,
    selectedLibrary,
    setBookReadingFormat,
    toggleFavorite,
  )

  const isMenuOpen = openMenuBookId !== null

  const scheduleThumbnailWorkResume = useCallback(
    (delayMs: number) => {
      if (scrollIdleTimerRef.current) {
        clearTimeout(scrollIdleTimerRef.current)
      }
      scrollIdleTimerRef.current = setTimeout(() => {
        setThumbnailWorkPausedState(false)
        scrollIdleTimerRef.current = null
      }, delayMs)
    },
    [setThumbnailWorkPausedState],
  )
  const scheduleInitialThumbnailWorkResume = useCallback(() => {
    scheduleThumbnailWorkResume(COVER_THUMBNAIL_INITIAL_IDLE_DELAY_MS)
  }, [scheduleThumbnailWorkResume])
  const scheduleScrollQuietThumbnailWorkResume = useCallback(() => {
    scheduleThumbnailWorkResume(COVER_THUMBNAIL_SCROLL_QUIET_DELAY_MS)
  }, [scheduleThumbnailWorkResume])

  const handleScrollActive = useCallback(() => {
    if (scrollIdleTimerRef.current) {
      clearTimeout(scrollIdleTimerRef.current)
      scrollIdleTimerRef.current = null
    }
    setThumbnailWorkPausedState(true)
  }, [setThumbnailWorkPausedState])

  const handleScrollMoving = useCallback(() => {
    // Some simulator and momentum paths can miss an end callback. A throttled
    // scroll timer makes thumbnail work resume after the list is genuinely
    // quiet, while repeated scroll events keep pushing that resume out.
    if (!thumbnailWorkPausedRef.current) {
      setThumbnailWorkPausedState(true)
    }
    // scrollEventThrottle is 250ms. Keep the quiet delay longer than that so
    // thumbnail resizing cannot resume between two active scroll events.
    scheduleScrollQuietThumbnailWorkResume()
  }, [scheduleScrollQuietThumbnailWorkResume, setThumbnailWorkPausedState])

  useEffect(() => {
    setCoverThumbnailDisplayBookIds(new Set())
    setCoverThumbnailGenerationBookIds(new Set())
    setThumbnailWorkPausedState(true)
    scheduleInitialThumbnailWorkResume()
  }, [
    coverThumbnailLayout.height,
    coverThumbnailLayout.width,
    debouncedQuery,
    filter,
    scheduleInitialThumbnailWorkResume,
    selectedLibraryId,
    setThumbnailWorkPausedState,
    sortBy,
    viewMode,
  ])

  const handleViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken<BookItem>[] }) => {
      // Keep display lookahead larger than generation lookahead: cached file
      // reads are cheap enough to happen during scroll, while thumbnail
      // generation may download, decode, and resize source covers.
      const nextDisplayIds = resolveCoverThumbnailBookIds({
        visibleBooks,
        viewableItems,
        lookaroundItemCount: getCoverThumbnailDisplayLookaroundItemCount(
          isGridView,
          gridColumns,
        ),
      })
      const nextGenerationIds = resolveCoverThumbnailBookIds({
        visibleBooks,
        viewableItems,
        lookaroundItemCount: 0,
      })
      setCoverThumbnailDisplayBookIds((current) =>
        sameStringSet(current, nextDisplayIds) ? current : nextDisplayIds,
      )
      setCoverThumbnailGenerationBookIds((current) =>
        sameStringSet(current, nextGenerationIds) ? current : nextGenerationIds,
      )
    },
    [gridColumns, isGridView, visibleBooks],
  )

  const seedInitialCoverThumbnails = useCallback(() => {
    // FlashList can delay the first viewability callback. Seed a wider display
    // window so existing thumbnails appear immediately, but keep generation at
    // the old bounded first-screen size.
    const nextDisplayIds = resolveInitialCoverThumbnailBookIds({
      visibleBooks,
      itemCount: getInitialCoverThumbnailDisplayItemCount(
        isGridView,
        gridColumns,
      ),
    })
    const nextGenerationIds = resolveInitialCoverThumbnailBookIds({
      visibleBooks,
      itemCount: getInitialCoverThumbnailItemCount(isGridView, gridColumns),
    })
    setCoverThumbnailDisplayBookIds((current) =>
      sameStringSet(current, nextDisplayIds) ? current : nextDisplayIds,
    )
    setCoverThumbnailGenerationBookIds((current) =>
      sameStringSet(current, nextGenerationIds) ? current : nextGenerationIds,
    )
  }, [gridColumns, isGridView, visibleBooks])

  const handleFlashListLoad = useCallback<
    NonNullable<ComponentProps<typeof FlashList<BookItem>>["onLoad"]>
  >(
    (info) => {
      onLoad?.(info)
      setThumbnailWorkPausedState(true)
      seedInitialCoverThumbnails()
      scheduleInitialThumbnailWorkResume()
    },
    [
      onLoad,
      scheduleInitialThumbnailWorkResume,
      seedInitialCoverThumbnails,
      setThumbnailWorkPausedState,
    ],
  )

  const renderItem = useCallback(
    ({ item, target }: ListRenderItemInfo<BookItem>) => {
      recordRenderTarget?.(target)

      const cellMeta = bookCellMetaById.get(item.id)
      const downloadStatus = cellMeta?.downloadStatus ?? "notDownloaded"
      const readerFormat = cellMeta?.readerFormat
      const progress = cellMeta?.progress
      const subscriptionLibraryId = cellMeta?.subscriptionLibraryId
      const subscriptionFormat = cellMeta?.subscriptionFormat
      const menuActions = cellMeta?.menuActions
      const displayCoverUri = displayCoverUriByBookId.get(item.id)
      const deferCoverUntilDisplayUri = !!item.coverUri

      if (isGridView) {
        const bookCard = (
          <BookCard
            book={item}
            displayCoverUri={displayCoverUri}
            deferCoverUntilDisplayUri={deferCoverUntilDisplayUri}
            downloadStatus={downloadStatus}
            width={cardWidth}
            readerFormat={readerFormat}
            isAnyMenuOpen={isMenuOpen}
            onPress={handleBookPress}
            menuIsRemote={isRemote}
            menuActions={menuActions}
            onMenuAction={handleBookMenuAction}
            onMenuOpen={handleMenuOpen}
            onMenuClose={handleMenuClose}
            subscriptionLibraryId={subscriptionLibraryId}
            subscriptionFormat={subscriptionFormat}
            progress={progress}
            profilerOnRender={cardSegmentProfilerOnRender}
            chrome={bookCardChrome}
            moreActionsLabel={cellMeta?.moreActionsLabel ?? item.title}
            openBookLabel={cellMeta?.openBookLabel}
          />
        )

        return (
          <View style={GRID_CELL_CONTAINER_STYLE}>
            {cardSegmentProfilerOnRender ? (
              <Profiler
                id="BookCard.total"
                onRender={cardSegmentProfilerOnRender}
              >
                {bookCard}
              </Profiler>
            ) : (
              bookCard
            )}
          </View>
        )
      }

      return (
        <BookRow
          book={item}
          displayCoverUri={displayCoverUri}
          deferCoverUntilDisplayUri={deferCoverUntilDisplayUri}
          downloadStatus={downloadStatus}
          readerFormat={readerFormat}
          isAnyMenuOpen={isMenuOpen}
          onPress={handleBookPress}
          menuIsRemote={isRemote}
          menuActions={menuActions}
          onMenuAction={handleBookMenuAction}
          onMenuOpen={handleMenuOpen}
          onMenuClose={handleMenuClose}
          horizontalPadding={LIST_PADDING_X}
          subscriptionLibraryId={subscriptionLibraryId}
          subscriptionFormat={subscriptionFormat}
          progress={progress}
        />
      )
    },
    [
      bookCellMetaById,
      bookCardChrome,
      cardSegmentProfilerOnRender,
      cardWidth,
      displayCoverUriByBookId,
      handleBookMenuAction,
      handleBookPress,
      handleMenuClose,
      handleMenuOpen,
      isGridView,
      isMenuOpen,
      isRemote,
      recordRenderTarget,
    ],
  )

  const getItemType = useCallback(
    () => (isGridView ? "grid" : "list"),
    [isGridView],
  )

  const flashListExtraData = useMemo(
    () => ({
      bookCardChrome,
      bookCellMetaById,
      cardWidth,
      displayCoverUriByBookId,
      isMenuOpen,
    }),
    [
      bookCardChrome,
      bookCellMetaById,
      cardWidth,
      displayCoverUriByBookId,
      isMenuOpen,
    ],
  )

  const header = (
    <>
      <Stack.Screen options={options} />
      {toolbar}
    </>
  )

  const emptyState = useMemo(() => {
    if (query.length > 0) {
      return {
        title: t("library.noMatch.search.title"),
        detail: t("library.noMatch.search.detail"),
        icon: { ios: "magnifyingglass", android: "search" } as const,
      }
    }
    if (filter === "favorites") {
      return {
        title: t("library.noMatch.favorites.title"),
        detail: t("library.noMatch.favorites.detail"),
        icon: { ios: "star.fill", android: "star" } as const,
      }
    }
    if (books.length === 0) {
      return {
        title: t("library.noMatch.empty.title"),
        detail: t("library.noMatch.empty.detail"),
        icon: { ios: "books.vertical", android: "library-books" } as const,
      }
    }
    if (filter !== "all") {
      return {
        title: t("library.noMatch.filter.title"),
        detail: t("library.noMatch.filter.detail"),
        icon: {
          ios: "line.3.horizontal.decrease.circle",
          android: "filter-list",
        } as const,
      }
    }
    return {
      title: t("library.noMatch.search.title"),
      detail: t("library.noMatch.search.detail"),
      icon: { ios: "magnifyingglass", android: "search" } as const,
    }
  }, [query.length, books.length, filter, t])

  if (variant === "loading") {
    return (
      <>
        {header}
        <Screen>
          <EmptyState
            title={t("library.loading.title")}
            detail={t("library.loading.detail")}
            icon={{ ios: "hourglass", android: "hourglass-empty" }}
          />
        </Screen>
      </>
    )
  }

  if (variant === "invalid") {
    return (
      <>
        {header}
        <Screen>
          <EmptyState
            title={t("library.notFound.title")}
            detail={t("library.notFound.detail")}
            icon={{ ios: "exclamationmark.triangle.fill", android: "warning" }}
          />
        </Screen>
      </>
    )
  }

  if (variant === "empty") {
    return (
      <>
        {header}
        <Screen>
          <EmptyState
            title={t("library.noLibrary.title")}
            detail={t("library.noLibrary.detail")}
            action={
              <PrimaryButton
                title={t("library.addLibrary")}
                onPress={() => router.push("/settings/add-library")}
              />
            }
            icon={{ ios: "books.vertical.fill", android: "library-books" }}
          />
        </Screen>
      </>
    )
  }

  if (variant === "unselected") {
    return (
      <>
        {header}
        <Screen>
          <EmptyState
            title={t("library.unselected.title")}
            detail={t("library.unselected.detail")}
            action={
              <RoundIconButton
                label={t("library.switchLibrary")}
                onPress={openLibrarySwitchMenu}
                icon={
                  <MaterialIcons
                    name="swap-horiz"
                    size={22}
                    color={palette.text}
                  />
                }
              />
            }
            icon={{ ios: "list.bullet.rectangle", android: "list" }}
          />
        </Screen>
      </>
    )
  }

  const flashList = (
    <FlashList
      key={`${viewMode}-${gridColumns}-${activeLibraryId ?? "none"}`}
      data={isLoadingNewContent ? [] : visibleBooks}
      extraData={flashListExtraData}
      numColumns={isGridView ? gridColumns : 1}
      keyExtractor={(item) => item.id}
      getItemType={getItemType}
      contentInsetAdjustmentBehavior="automatic"
      className="flex-1"
      style={{ backgroundColor: palette.background }}
      contentContainerStyle={{
        paddingHorizontal: isGridView ? GRID_PADDING_X - GRID_CARD_GAP / 2 : 0,
        paddingTop: 16,
        paddingBottom: 40,
      }}
      ItemSeparatorComponent={isGridView ? SeparatorGrid : SeparatorList}
      drawDistance={listDrawDistance}
      maintainVisibleContentPosition={
        DISABLED_MAINTAIN_VISIBLE_CONTENT_POSITION
      }
      ListEmptyComponent={
        isLoadingNewContent ? (
          <LibrarySkeletonContent
            viewMode={viewMode}
            cardWidth={cardWidth}
            gridColumns={gridColumns}
            gridGap={GRID_CARD_GAP}
            listPaddingX={LIST_PADDING_X}
          />
        ) : booksError ? (
          <EmptyState
            title={t("library.loadError.title")}
            detail={booksError.message}
            icon={{
              ios: "exclamationmark.triangle.fill",
              android: "warning",
            }}
          />
        ) : (
          <EmptyState
            title={emptyState.title}
            detail={emptyState.detail}
            icon={emptyState.icon}
          />
        )
      }
      onCommitLayoutEffect={onCommitLayoutEffect}
      onMomentumScrollBegin={handleScrollActive}
      onMomentumScrollEnd={scheduleScrollQuietThumbnailWorkResume}
      onScroll={handleScrollMoving}
      onScrollBeginDrag={handleScrollActive}
      onScrollEndDrag={scheduleScrollQuietThumbnailWorkResume}
      onTouchCancel={scheduleScrollQuietThumbnailWorkResume}
      onTouchEnd={scheduleScrollQuietThumbnailWorkResume}
      onTouchStart={handleScrollActive}
      scrollEventThrottle={250}
      onViewableItemsChanged={handleViewableItemsChanged}
      onLoad={handleFlashListLoad}
      renderItem={renderItem}
      viewabilityConfig={COVER_THUMBNAIL_VIEWABILITY_CONFIG}
    />
  )

  return (
    <>
      {header}
      {onRender ? (
        <Profiler id="LibraryScreen.FlashList" onRender={onRender}>
          {flashList}
        </Profiler>
      ) : (
        flashList
      )}
    </>
  )
}
