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
import { Stack, useIsFocused } from "expo-router"
import { useTranslation } from "react-i18next"
import { Dimensions, PixelRatio, View, useWindowDimensions } from "react-native"
import { libraryTypeOf } from "@my-reader/tools/types/library"

import { showAlertWithStatusBarRestore } from "@/src/constants/alert-with-status-bar"
import {
  COVER_THUMBNAIL_DISPLAY_LOOKAROUND_GRID_ROWS,
  COVER_THUMBNAIL_DISPLAY_LOOKAROUND_LIST_ITEMS,
  COVER_THUMBNAIL_INITIAL_GRID_ROWS,
  COVER_THUMBNAIL_INITIAL_IDLE_DELAY_MS,
  COVER_THUMBNAIL_INITIAL_LIST_ITEMS,
  COVER_THUMBNAIL_SCROLL_QUIET_DELAY_MS,
  COVER_THUMBNAIL_VIEWABILITY_CONFIG,
  LIBRARY_GRID_CARD_GAP,
  LIBRARY_GRID_CARD_META_HEIGHT,
  LIBRARY_GRID_CELL_CONTAINER_STYLE,
  LIBRARY_GRID_DRAW_DISTANCE_ROWS,
  LIBRARY_GRID_PADDING_X,
  LIBRARY_LIST_DRAW_DISTANCE_ROWS,
  LIBRARY_LIST_MAINTAIN_VISIBLE_CONTENT_POSITION,
  LIBRARY_LIST_PADDING_X,
  LIBRARY_LIST_ROW_ESTIMATED_HEIGHT,
  LIBRARY_LIST_SCROLL_EVENT_THROTTLE_MS,
} from "@/src/config/library-list-performance"
import {
  DEVELOPER_TOOLS_ENABLED,
  LIBRARY_CARD_SEGMENT_PROFILER_ENABLED,
} from "@/src/constants/developer-tools"
import { coverLoadingSkeletonColor } from "@/src/design/cover-skeleton"
import { useThemePalette } from "@/src/design/tokens"

import {
  EmptyState,
  PrimaryButton,
  RoundIconButton,
  Screen,
} from "@/src/components"
import {
  importBookFromPicker,
  switchActiveLibrary,
} from "@/src/domain/library/hooks/library-actions"
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
import { NoLibraryEmptyState } from "@/src/features/library/components/no-library-empty-state"
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
import {
  useBooks,
  usePendingBookImports,
} from "@/src/features/library/hooks/useLibraryQuery"
import {
  resolveCoverThumbnailBookIds,
  resolveInitialCoverThumbnailBookIds,
} from "@/src/features/library/utils/cover-thumbnail-window"
import {
  resolveFullscreenGridCoverThumbnailSizes,
  resolveLibraryGridCardWidth,
  resolveLibraryGridColumns,
} from "@/src/features/library/utils/cover-thumbnail-profiles"
import { buildLibraryBookCellMetaById } from "@/src/features/library/utils/library-book-cell-meta"
import { resolveLibraryScreenVariant } from "@/src/features/library/utils/resolve-library-screen-variant"
import { useLibraryBookMeta } from "@/src/hooks/use-library-book-meta"
import { useAppStore } from "@/src/store/app-store"
import { useBookActions } from "./hooks/use-book-actions"

const defaultSortOption: SortOption = "recentlyAdded"

type LibraryScreenProps = {
  libraryId?: string
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
    return LIBRARY_LIST_ROW_ESTIMATED_HEIGHT * LIBRARY_LIST_DRAW_DISTANCE_ROWS
  }

  // `drawDistance` is only the FlashList render buffer. Thumbnail work has its
  // own visible-priority/background queues so a larger render buffer does not
  // directly start more decode/resize work during scroll.
  const gridRowHeight =
    getBookCardCoverHeight(cardWidth) +
    LIBRARY_GRID_CARD_META_HEIGHT +
    LIBRARY_GRID_CARD_GAP
  return Math.round(gridRowHeight * LIBRARY_GRID_DRAW_DISTANCE_ROWS)
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
  return <View style={{ height: LIBRARY_GRID_CARD_GAP }} />
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
  const { height, width } = useWindowDimensions()
  const screenBounds = Dimensions.get("screen")
  const pixelRatio = PixelRatio.get()
  const gridColumns = resolveLibraryGridColumns(width)
  const cardWidth = resolveLibraryGridCardWidth(width, gridColumns)
  const coverThumbnailGridSizes = useMemo(
    () =>
      resolveFullscreenGridCoverThumbnailSizes({
        pixelRatio,
        screenHeight: Math.max(screenBounds.height, height),
        screenWidth: Math.max(screenBounds.width, width),
      }),
    [height, pixelRatio, screenBounds.height, screenBounds.width, width],
  )
  const { switchLibrary } = { switchLibrary: switchActiveLibrary }
  const libraries = useAppStore((s) => s.libraries)
  const activeLibraryId = useAppStore((s) => s.activeLibraryId)
  const storeReady = useAppStore((s) => s.storeReady)
  const effectiveLibraryId = libraryIdProp ?? activeLibraryId ?? undefined
  const {
    data: books = [],
    isLoading: loadingBooks,
    error: booksError,
    refetch: refetchBooks,
  } = useBooks(activeLibraryId)
  const { data: pendingBookImports = [] } =
    usePendingBookImports(activeLibraryId)
  const { syncNow } = useSyncLibrary()
  const viewMode = useAppStore((s) => s.libraryViewMode)
  const setViewMode = useAppStore((s) => s.setLibraryViewMode)
  const libraryPerformanceProfilerEnabled = useAppStore(
    (s) => s.settings.libraryPerformanceProfilerEnabled,
  )
  const coverLoadingSkeletonPulseEnabled = useAppStore(
    (s) => s.settings.coverLoadingSkeletonPulseEnabled,
  )
  const coverThumbnailGenerationConcurrency = useAppStore(
    (s) => s.settings.coverThumbnailGenerationConcurrency,
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

  const isLoadingNewContent =
    loadingBooks && books.length === 0 && pendingBookImports.length === 0

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
    bookCanUploadById,
    bookCanDeleteDownloadById,
    bookDownloadStatusById,
    bookTransferStatusById,
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
  const displayedBooks = useMemo(
    () => [...pendingBookImports, ...visibleBooks],
    [pendingBookImports, visibleBooks],
  )
  const isRemote = isRemoteSourceType(selectedLibrary?.sourceType)
  const isManagedLibrary =
    selectedLibrary !== null && libraryTypeOf(selectedLibrary) === "myreader"
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
  const coverThumbnailScopeKey = useCoverThumbnails({
    enabled: isLibraryFocused,
    backgroundGenerationBookIds: coverThumbnailDisplayBookIds,
    generationConcurrency: coverThumbnailGenerationConcurrency,
    generationBookIds: coverThumbnailGenerationBookIds,
    paused: thumbnailWorkPaused,
    library: selectedLibrary,
    books: coverThumbnailDisplayBooks,
    thumbnailSizes: coverThumbnailGridSizes,
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
        bookCanUploadById,
        bookCanDeleteDownloadById,
        bookDownloadStatusById,
        bookTransferStatusById,
        bookFormatMetaById,
        bookFormatsById,
        favoriteSet,
        isManaged: isManagedLibrary,
        isRemote,
        progressByBookId,
        selectedFormatById,
        selectedLibraryId,
        translate: t,
        visibleBooks,
      }),
    [
      bookActiveFormatsById,
      bookCanUploadById,
      bookCanDeleteDownloadById,
      bookDownloadStatusById,
      bookTransferStatusById,
      bookFormatMetaById,
      bookFormatsById,
      favoriteSet,
      isManagedLibrary,
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
      coverSkeletonColor: coverLoadingSkeletonColor(palette),
      coverLoadingSkeletonPulseEnabled,
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
      textColor: palette.text,
      textMutedColor: palette.textMuted,
    }),
    [
      coverLoadingSkeletonPulseEnabled,
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

  const handleImportBook = useCallback(() => {
    void importBookFromPicker(isManagedLibrary ? selectedLibrary : null).catch(
      (error) => {
        showAlertWithStatusBarRestore(
          t("library.importFailed.title"),
          error instanceof Error ? error.message : String(error),
        )
      },
    )
  }, [isManagedLibrary, selectedLibrary, t])

  const { options, toolbar } = useLibraryHeaderChrome({
    variant,
    selectedLibrary,
    libraries,
    effectiveLibraryId,
    filter,
    sortBy,
    viewMode,
    onSyncCurrentLibrary: handleSyncCurrentLibrary,
    canImportBook: isManagedLibrary,
    onImportBook: handleImportBook,
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
    // Keep the quiet delay longer than the configured scrollEventThrottle so
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
      // Keep display lookahead larger than the visible-priority generation
      // window. The thumbnail hook still receives display ids as a background
      // warmup lane, but it only runs that lane while scroll work is paused.
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
    // window so existing thumbnails appear immediately; the hook uses that same
    // window as low-priority idle warmup after first-screen covers are queued.
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
      const isImporting = item.importStatus === "importing"
      const downloadStatus = isImporting
        ? "downloading"
        : (cellMeta?.downloadStatus ?? "notDownloaded")
      const transferStatus = isImporting
        ? "downloading"
        : (cellMeta?.transferStatus ?? downloadStatus)
      const readerFormat = cellMeta?.readerFormat
      const progress = isImporting
        ? { statusLabel: t("library.importingBook") }
        : cellMeta?.progress
      const subscriptionLibraryId = isImporting
        ? undefined
        : cellMeta?.subscriptionLibraryId
      const subscriptionFormat = isImporting
        ? undefined
        : cellMeta?.subscriptionFormat
      const menuActions = isImporting ? undefined : cellMeta?.menuActions
      const deferCoverUntilDisplayUri = !!item.coverUri

      if (isGridView) {
        const bookCard = (
          <BookCard
            book={item}
            deferCoverUntilDisplayUri={deferCoverUntilDisplayUri}
            thumbnailScopeKey={coverThumbnailScopeKey}
            downloadStatus={downloadStatus}
            transferStatus={transferStatus}
            width={cardWidth}
            readerFormat={readerFormat}
            isAnyMenuOpen={isMenuOpen}
            onPress={isImporting ? undefined : handleBookPress}
            menuIsRemote={isImporting ? undefined : isRemote}
            menuActions={menuActions}
            onMenuAction={isImporting ? undefined : handleBookMenuAction}
            onMenuOpen={isImporting ? undefined : handleMenuOpen}
            onMenuClose={isImporting ? undefined : handleMenuClose}
            subscriptionLibraryId={subscriptionLibraryId}
            subscriptionFormat={subscriptionFormat}
            progress={progress}
            profilerOnRender={cardSegmentProfilerOnRender}
            chrome={bookCardChrome}
            moreActionsLabel={
              cellMeta?.moreActionsLabel ?? t("library.importingBook")
            }
            openBookLabel={isImporting ? undefined : cellMeta?.openBookLabel}
          />
        )

        return (
          <View style={LIBRARY_GRID_CELL_CONTAINER_STYLE}>
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
          deferCoverUntilDisplayUri={deferCoverUntilDisplayUri}
          thumbnailScopeKey={coverThumbnailScopeKey}
          downloadStatus={downloadStatus}
          transferStatus={transferStatus}
          readerFormat={readerFormat}
          isAnyMenuOpen={isMenuOpen}
          onPress={isImporting ? undefined : handleBookPress}
          menuIsRemote={isImporting ? undefined : isRemote}
          menuActions={menuActions}
          onMenuAction={isImporting ? undefined : handleBookMenuAction}
          onMenuOpen={isImporting ? undefined : handleMenuOpen}
          onMenuClose={isImporting ? undefined : handleMenuClose}
          horizontalPadding={LIBRARY_LIST_PADDING_X}
          subscriptionLibraryId={subscriptionLibraryId}
          subscriptionFormat={subscriptionFormat}
          progress={progress}
          loadingSkeletonPulseEnabled={coverLoadingSkeletonPulseEnabled}
        />
      )
    },
    [
      bookCellMetaById,
      bookCardChrome,
      cardSegmentProfilerOnRender,
      cardWidth,
      coverLoadingSkeletonPulseEnabled,
      coverThumbnailScopeKey,
      handleBookMenuAction,
      handleBookPress,
      handleMenuClose,
      handleMenuOpen,
      isGridView,
      isMenuOpen,
      isRemote,
      recordRenderTarget,
      t,
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
      coverThumbnailScopeKey,
      isMenuOpen,
    }),
    [
      bookCardChrome,
      bookCellMetaById,
      cardWidth,
      coverThumbnailScopeKey,
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
          <NoLibraryEmptyState />
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
      data={isLoadingNewContent ? [] : displayedBooks}
      extraData={flashListExtraData}
      numColumns={isGridView ? gridColumns : 1}
      keyExtractor={(item) => item.id}
      getItemType={getItemType}
      contentInsetAdjustmentBehavior="automatic"
      className="flex-1"
      style={{ backgroundColor: palette.background }}
      contentContainerStyle={{
        paddingHorizontal: isGridView
          ? LIBRARY_GRID_PADDING_X - LIBRARY_GRID_CARD_GAP / 2
          : 0,
        paddingTop: 16,
        paddingBottom: 40,
      }}
      ItemSeparatorComponent={isGridView ? SeparatorGrid : SeparatorList}
      drawDistance={listDrawDistance}
      maintainVisibleContentPosition={
        LIBRARY_LIST_MAINTAIN_VISIBLE_CONTENT_POSITION
      }
      ListEmptyComponent={
        isLoadingNewContent ? (
          <LibrarySkeletonContent
            viewMode={viewMode}
            cardWidth={cardWidth}
            gridColumns={gridColumns}
            gridGap={LIBRARY_GRID_CARD_GAP}
            listPaddingX={LIBRARY_LIST_PADDING_X}
          />
        ) : booksError ? (
          <EmptyState
            title={t("library.loadError.title")}
            detail={booksError.message}
            action={
              <PrimaryButton
                title={t("errorBoundary.retry")}
                onPress={() => void refetchBooks()}
              />
            }
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
            action={
              isManagedLibrary &&
              books.length === 0 &&
              filter === "all" &&
              query.length === 0 ? (
                <PrimaryButton
                  title={t("library.importBook")}
                  onPress={handleImportBook}
                />
              ) : undefined
            }
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
      scrollEventThrottle={LIBRARY_LIST_SCROLL_EVENT_THROTTLE_MS}
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
