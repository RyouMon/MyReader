import type { CalibreBook } from "@my-reader/tools/types/book"
import { useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { AlertCircle, BookOpen, Library } from "lucide-react"
import { useCallback, useMemo } from "react"
import { useTranslation } from "react-i18next"
import BookGrid, { LibrarySkeletonGrid } from "@/components/library/BookGrid"
import Toolbar from "@/components/library/Toolbar"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  type BookFileStateLookup,
  useBookFileStates,
} from "@/hooks/queries/useBookFileState"
import { useBookReadingFormats } from "@/hooks/queries/useBookReadingFormatsQuery"
import {
  invalidateFavoriteBookQueries,
  useFavoriteBooks,
} from "@/hooks/queries/useFavoriteBooksQuery"
import {
  libraryKeys,
  useLibrariesQuery,
} from "@/hooks/queries/useLibrariesQuery"
import {
  readingProgressKeys,
  useBookReadingProgress,
} from "@/hooks/queries/useReadingProgressQuery"
import { useOpenReader } from "@/hooks/reader/useOpenReader"
import { usePaginatedBooks } from "@/hooks/reader/usePaginatedBooks"
import { useWindowSizeClass } from "@/hooks/use-window-size-class"
import { useDebouncedValue } from "@/hooks/useDebouncedValue"
import { resetBrokenCovers } from "@/lib/coverFailureCache"
import { pickReadableFormat } from "@/lib/readFormats"
import { api, formatApiError } from "@/lib/tauri-api"
import { cn } from "@/lib/utils"
import { useAppUiStore } from "@/stores/appUiStore"
import { useLibraryUiStore } from "@/stores/libraryUiStore"
import BookDetailPane from "./BookDetailPane"

interface LibraryWorkspaceProps {
  activeBookId: string | null
}

const EMPTY_SELECTED_FORMATS: Record<string, string> = {}

export default function LibraryWorkspace({
  activeBookId,
}: LibraryWorkspaceProps) {
  const { t } = useTranslation()
  const { data: libraries = [], isLoading: libLoading } = useLibrariesQuery()
  const activeLibraryId = useLibraryUiStore((s) => s.activeLibraryId)
  const activeView = useLibraryUiStore((s) => s.activeView)
  const searchQuery = useLibraryUiStore((s) => s.librarySearchQuery)
  const setSearchQuery = useLibraryUiStore((s) => s.setLibrarySearchQuery)
  const sortBy = useLibraryUiStore((s) => s.librarySortBy)
  const setSortBy = useLibraryUiStore((s) => s.setLibrarySortBy)
  const activeLibrary = libraries.find((l) => l.id === activeLibraryId) ?? null
  const fileActionsEnabled =
    activeLibrary?.sourceType != null && activeLibrary.sourceType !== "local"
  const { data: selectedFormatById = EMPTY_SELECTED_FORMATS } =
    useBookReadingFormats(activeLibraryId)
  const { data: progressByBookId = {} } =
    useBookReadingProgress(activeLibraryId)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const openReader = useOpenReader()
  const windowSizeClass = useWindowSizeClass()

  const viewMode = useAppUiStore((s) => s.libraryViewMode)
  const setViewMode = useAppUiStore((s) => s.setLibraryViewMode)
  const detailFullScreen = useAppUiStore((s) => s.detailFullScreen)
  const setDetailFullScreen = useAppUiStore((s) => s.setDetailFullScreen)
  const isSmallWindow = windowSizeClass === "small"
  const isMediumWindow = windowSizeClass === "medium"
  const isSplitMode = Boolean(
    activeBookId && !isSmallWindow && !detailFullScreen,
  )
  const showListPane = !activeBookId || isSplitMode
  const keepsListSplitGeometry = Boolean(activeBookId && !isSmallWindow)
  const isDetailOverlay = Boolean(activeBookId && !showListPane)
  const showDetailPane = Boolean(activeBookId)
  const forceNarrowDetailHero = isSmallWindow || (isSplitMode && isMediumWindow)
  const canToggleDetailFullScreen = Boolean(activeBookId && !isSmallWindow)

  const debouncedSearch = useDebouncedValue(searchQuery, 300)
  const booksSortBy = activeView === "recent" ? "lastRead" : sortBy

  const { books, total, initialLoading, error, ensureRange, refresh } =
    usePaginatedBooks(activeLibraryId, booksSortBy, debouncedSearch)
  const favoriteBooksQuery = useFavoriteBooks(
    activeLibraryId,
    sortBy,
    debouncedSearch,
  )
  const favoriteBooks = useMemo(() => {
    const m = new Map<number, CalibreBook>()
    for (const [index, book] of (
      favoriteBooksQuery.data?.items ?? []
    ).entries()) {
      m.set(index, book)
    }
    return m
  }, [favoriteBooksQuery.data?.items])

  const displayedBooks = activeView === "favorites" ? favoriteBooks : books
  const displayedTotal =
    activeView === "favorites" ? (favoriteBooksQuery.data?.total ?? 0) : total
  const displayedLoading =
    activeView === "favorites" ? favoriteBooksQuery.isLoading : initialLoading
  const displayedError =
    activeView === "favorites"
      ? favoriteBooksQuery.error
        ? String(favoriteBooksQuery.error)
        : null
      : error
  const displayedEnsureRange =
    activeView === "favorites" ? () => undefined : ensureRange
  const displayedRefresh =
    activeView === "favorites"
      ? () => void favoriteBooksQuery.refetch()
      : refresh
  const loading = libLoading || displayedLoading
  const fileStateLookups = useMemo<BookFileStateLookup[]>(() => {
    if (!activeLibraryId || !fileActionsEnabled) return []

    return Array.from(displayedBooks.values(), (book) => ({
      bookId: book.id,
      format:
        selectedFormatById[String(book.id)] ?? pickReadableFormat(book.formats),
    }))
  }, [activeLibraryId, displayedBooks, fileActionsEnabled, selectedFormatById])
  useBookFileStates(
    activeLibraryId,
    fileStateLookups,
    fileActionsEnabled && !loading && !displayedError && displayedTotal > 0,
  )

  const handleRefresh = async () => {
    if (!activeLibraryId) return
    try {
      await api.syncDbForLibrary(activeLibraryId)
      resetBrokenCovers()
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: libraryKeys.all,
        }),
        queryClient.invalidateQueries({
          queryKey: readingProgressKeys.list(activeLibraryId),
        }),
        invalidateFavoriteBookQueries(queryClient, activeLibraryId),
      ])
      refresh()
    } catch (e) {
      console.error(
        `Failed to sync db. library id: "${activeLibraryId}", error: ${formatApiError(e)}`,
      )
    }
  }

  const sectionLabel =
    activeView === "favorites"
      ? t("library.favoritesTitle")
      : activeView === "recent"
        ? t("library.recentTitle")
        : t("library.title")

  function handleOpenReader(book: CalibreBook) {
    void openReader({
      bookId: book.id,
      format: selectedFormatById[String(book.id)] ?? undefined,
      title: book.title,
    })
  }

  function handleOpenDetail(book: CalibreBook) {
    navigate({
      to: "/book/$bookId",
      params: { bookId: String(book.id) },
    })
  }

  const handleBackToList = useCallback(() => {
    navigate({ to: "/" })
  }, [navigate])

  const hasNoLibrary = libraries.length === 0

  const gridHeader = (
    <div className="flex items-baseline gap-2.5 mb-4 pt-5">
      <h2 className="text-xl font-semibold">{sectionLabel}</h2>
      <span className="text-sm text-muted-foreground font-normal">
        {t("library.booksCount", { count: displayedTotal })}
      </span>
    </div>
  )

  return (
    <section
      className={cn(
        "flex min-h-0 flex-1 flex-col overflow-hidden bg-background",
        isSplitMode && "[&_[data-testid=library-scroll]]:px-5",
      )}
    >
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <div
          data-testid="library-pane"
          aria-hidden={!showListPane}
          className={cn(
            "flex min-w-0 flex-1 flex-col",
            showListPane
              ? "relative z-10"
              : "pointer-events-none invisible absolute top-0 bottom-0 start-0 z-0 h-full",
            keepsListSplitGeometry
              ? "w-1/2 max-w-none flex-none shrink-0"
              : showListPane
                ? "flex-1"
                : "end-0",
          )}
        >
          <Toolbar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            sortBy={sortBy}
            onSortChange={setSortBy}
            onRefresh={handleRefresh}
          />

          {loading && !displayedError && (
            <LibrarySkeletonGrid viewMode={viewMode} />
          )}

          {!loading && displayedError && (
            <Empty className="min-h-0 flex-1">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <AlertCircle className="text-destructive" />
                </EmptyMedia>
                <EmptyTitle>{t("library.loadingFailed")}</EmptyTitle>
                <EmptyDescription>{displayedError}</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button variant="outline" size="sm" onClick={displayedRefresh}>
                  {t("common.retry")}
                </Button>
              </EmptyContent>
            </Empty>
          )}

          {!loading && !displayedError && hasNoLibrary && (
            <Empty className="min-h-0 flex-1">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Library />
                </EmptyMedia>
                <EmptyTitle>{t("library.empty.noLibraryTitle")}</EmptyTitle>
                <EmptyDescription>
                  {t("library.empty.noLibraryDesc")}
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button size="sm" onClick={() => navigate({ to: "/settings" })}>
                  {t("library.empty.goToSettings")}
                </Button>
              </EmptyContent>
            </Empty>
          )}

          {!loading &&
            !displayedError &&
            !hasNoLibrary &&
            displayedTotal > 0 && (
              <div className="flex min-h-0 flex-1">
                <BookGrid
                  books={displayedBooks}
                  total={displayedTotal}
                  libraryId={activeLibraryId}
                  onRead={handleOpenDetail}
                  onOpenReader={handleOpenReader}
                  ensureRange={displayedEnsureRange}
                  header={gridHeader}
                  viewMode={viewMode}
                  fileActionsEnabled={fileActionsEnabled}
                  selectedFormatById={selectedFormatById}
                  progressByBookId={progressByBookId}
                  activeBookId={activeBookId}
                />
              </div>
            )}

          {!loading &&
            !displayedError &&
            !hasNoLibrary &&
            displayedTotal === 0 && (
              <Empty className="min-h-0 flex-1">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <BookOpen />
                  </EmptyMedia>
                  <EmptyTitle>{t("library.empty.noBooks")}</EmptyTitle>
                  <EmptyDescription>
                    {searchQuery
                      ? t("library.empty.tryOtherKeywords")
                      : t("library.empty.noBooksInLibrary")}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
        </div>

        {showDetailPane ? (
          <aside
            className={cn(
              "flex min-w-0 flex-1 flex-col bg-background p-0",
              isSplitMode && "w-1/2 flex-none",
              isDetailOverlay
                ? "absolute inset-0 z-20"
                : "relative z-10 animate-in fade-in-0 duration-150",
            )}
            data-testid="book-detail-shell"
          >
            <BookDetailPane
              bookId={activeBookId!}
              onBackToList={handleBackToList}
              forceNarrowHero={forceNarrowDetailHero}
              fullScreenAvailable={canToggleDetailFullScreen}
              detailFullScreen={detailFullScreen}
              onToggleDetailFullScreen={() =>
                setDetailFullScreen(!detailFullScreen)
              }
              showSidebarToggle={!showListPane}
            />
          </aside>
        ) : null}
      </div>

      <LibraryStatusBar activeLibrary={activeLibrary} />
    </section>
  )
}

function LibraryStatusBar({
  activeLibrary,
}: {
  activeLibrary: { name: string; bookCount?: number } | null
}) {
  const { t } = useTranslation()

  return (
    <footer className="flex h-8 shrink-0 items-center justify-between border-t border-border bg-background px-6 text-xs text-muted-foreground">
      <span>
        {activeLibrary?.name ?? t("sidebar.noLibrary")} /{" "}
        {t("sidebar.booksCount", {
          count: activeLibrary?.bookCount ?? 0,
        })}
      </span>
      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            "inline-block size-1.5 rounded-full",
            activeLibrary
              ? "bg-library-indicator-on"
              : "bg-library-indicator-off",
          )}
        />
        {activeLibrary ? t("sidebar.connected") : t("sidebar.disconnected")}
      </div>
    </footer>
  )
}
