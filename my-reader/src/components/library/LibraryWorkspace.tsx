import type { CalibreBook } from "@my-reader/tools/types/book"
import type { BuiltInBookCollectionId } from "@my-reader/tools/types/book-collection"
import type { Library as LibraryRecord } from "@my-reader/tools/types/library"
import {
  isRemoteLibrarySourceType,
  libraryTypeOf,
} from "@my-reader/tools/types/library"
import { useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { open } from "@tauri-apps/plugin-dialog"
import { AlertCircle, Library } from "lucide-react"
import { useCallback, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import BookGrid, { LibrarySkeletonGrid } from "@/components/library/BookGrid"
import LibrarySyncStatus from "@/components/library/LibrarySyncStatus"
import Toolbar from "@/components/library/Toolbar"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
  bookFileStateKeys,
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
  useLibraryMutations,
} from "@/hooks/queries/useLibrariesQuery"
import { localOnlyBookKeys } from "@/hooks/queries/useLocalOnlyBooksQuery"
import { pendingBookUploadKeys } from "@/hooks/queries/usePendingBookUploadsQuery"
import {
  readingProgressKeys,
  useBookReadingProgress,
} from "@/hooks/queries/useReadingProgressQuery"
import {
  specialBookCollectionKeys,
  useSpecialBookCollection,
} from "@/hooks/queries/useSpecialBookCollectionQuery"
import { useOpenReader } from "@/hooks/reader/useOpenReader"
import { usePaginatedBooks } from "@/hooks/reader/usePaginatedBooks"
import { useWindowSizeClass } from "@/hooks/use-window-size-class"
import { useDebouncedValue } from "@/hooks/useDebouncedValue"
import { isSpecialBookCollectionId } from "@/lib/bookCollections"
import { resetBrokenCovers } from "@/lib/coverFailureCache"
import { api, formatApiError } from "@/lib/tauri-api"
import { cn } from "@/lib/utils"
import { useAppUiStore } from "@/stores/appUiStore"
import { useLibraryUiStore } from "@/stores/libraryUiStore"
import BookDetailPane from "./BookDetailPane"
import { getDesktopBookCollectionDefinition } from "./bookCollectionDefinitions"

interface LibraryWorkspaceProps {
  activeBookId: string | null
}

const EMPTY_SELECTED_FORMATS: Record<string, string> = {}
type DeletableBook = Pick<CalibreBook, "id" | "title">

export default function LibraryWorkspace({
  activeBookId,
}: LibraryWorkspaceProps) {
  const { t } = useTranslation()
  const { data: libraries = [], isLoading: libLoading } = useLibrariesQuery()
  const activeLibraryId = useLibraryUiStore((s) => s.activeLibraryId)
  const activeCollectionId = useLibraryUiStore((s) => s.activeCollectionId)
  const searchQuery = useLibraryUiStore((s) => s.librarySearchQuery)
  const setSearchQuery = useLibraryUiStore((s) => s.setLibrarySearchQuery)
  const sortBy = useLibraryUiStore((s) => s.librarySortBy)
  const setSortBy = useLibraryUiStore((s) => s.setLibrarySortBy)
  const activeLibrary = libraries.find((l) => l.id === activeLibraryId) ?? null
  const isRemoteLibrary = isRemoteLibrarySourceType(activeLibrary?.sourceType)
  const fileActionsEnabled = isRemoteLibrary
  const { data: selectedFormatById = EMPTY_SELECTED_FORMATS } =
    useBookReadingFormats(activeLibraryId)
  const { data: progressByBookId = {} } =
    useBookReadingProgress(activeLibraryId)
  const queryClient = useQueryClient()
  const { createDefaultMyreaderLibrary } = useLibraryMutations()
  const navigate = useNavigate()
  const openReader = useOpenReader()
  const windowSizeClass = useWindowSizeClass()
  const [importingBook, setImportingBook] = useState(false)
  const [bookPendingDeletion, setBookPendingDeletion] =
    useState<DeletableBook | null>(null)
  const [deletingBook, setDeletingBook] = useState(false)

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
  const isPaginatedCollection =
    activeCollectionId === "all" || activeCollectionId === "recentlyRead"
  const booksSortBy =
    activeCollectionId === "recentlyRead" ? "lastRead" : sortBy

  const { books, total, initialLoading, error, ensureRange, refresh } =
    usePaginatedBooks(
      isPaginatedCollection ? activeLibraryId : null,
      booksSortBy,
      debouncedSearch,
      Boolean(activeLibrary && libraryTypeOf(activeLibrary) === "myreader"),
    )
  const favoriteBooksQuery = useFavoriteBooks(
    activeCollectionId === "favorites" ? activeLibraryId : null,
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
  const specialCollection = useSpecialBookCollection({
    libraryId: activeLibraryId,
    collectionId: activeCollectionId,
    sortBy,
    search: debouncedSearch,
    selectedFormatById,
    isRemoteLibrary,
  })
  const isSpecialCollection = isSpecialBookCollectionId(activeCollectionId)

  const displayedBooks =
    activeCollectionId === "favorites"
      ? favoriteBooks
      : isSpecialCollection
        ? specialCollection.books
        : books
  const displayedTotal =
    activeCollectionId === "favorites"
      ? (favoriteBooksQuery.data?.total ?? 0)
      : isSpecialCollection
        ? specialCollection.total
        : total
  const displayedLoading =
    activeCollectionId === "favorites"
      ? favoriteBooksQuery.isLoading
      : isSpecialCollection
        ? specialCollection.initialLoading
        : initialLoading
  const displayedError =
    activeCollectionId === "favorites"
      ? favoriteBooksQuery.error
        ? String(favoriteBooksQuery.error)
        : null
      : isSpecialCollection
        ? specialCollection.error
        : error
  const displayedEnsureRange =
    activeCollectionId === "favorites"
      ? () => undefined
      : isSpecialCollection
        ? specialCollection.ensureRange
        : ensureRange
  const displayedRefresh =
    activeCollectionId === "favorites"
      ? () => void favoriteBooksQuery.refetch()
      : isSpecialCollection
        ? specialCollection.refresh
        : refresh
  const loading = libLoading || displayedLoading
  const fileStateLookups = useMemo<BookFileStateLookup[]>(() => {
    if (!activeLibraryId || !fileActionsEnabled) return []

    return Array.from(displayedBooks.values(), (book) => ({
      bookId: book.id,
      format: selectedFormatById[String(book.id)] ?? book.preferredFormat,
    }))
  }, [activeLibraryId, displayedBooks, fileActionsEnabled, selectedFormatById])
  useBookFileStates(
    activeLibraryId,
    fileStateLookups,
    fileActionsEnabled && !loading && !displayedError && displayedTotal > 0,
  )

  const handleCatalogChanged = useCallback(() => {
    resetBrokenCovers()
    void queryClient.invalidateQueries({ queryKey: libraryKeys.all })
    if (activeLibraryId) {
      void invalidateFavoriteBookQueries(queryClient, activeLibraryId)
      void queryClient.invalidateQueries({
        queryKey: specialBookCollectionKeys.catalog(activeLibraryId),
      })
      void queryClient.invalidateQueries({
        queryKey: localOnlyBookKeys.status(activeLibraryId),
      })
    }
    if (isPaginatedCollection) refresh()
  }, [activeLibraryId, isPaginatedCollection, queryClient, refresh])

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
        queryClient.invalidateQueries({
          queryKey: specialBookCollectionKeys.catalog(activeLibraryId),
        }),
        queryClient.invalidateQueries({
          queryKey: bookFileStateKeys.library(activeLibraryId),
        }),
        queryClient.invalidateQueries({
          queryKey: pendingBookUploadKeys.list(activeLibraryId),
        }),
        queryClient.invalidateQueries({
          queryKey: localOnlyBookKeys.status(activeLibraryId),
        }),
      ])
      if (activeLibrary && libraryTypeOf(activeLibrary) !== "myreader") {
        refresh()
      }
    } catch (e) {
      console.error(
        `Failed to sync db. library id: "${activeLibraryId}", error: ${formatApiError(e)}`,
      )
    }
  }

  const handleImportBook = async () => {
    if (importingBook) return
    try {
      const selected = await open({
        directory: false,
        multiple: false,
        title: t("library.importBook"),
      })
      if (!selected) return

      setImportingBook(true)
      let libraryId = activeLibraryId
      if (!libraryId) {
        const created = await createDefaultMyreaderLibrary(
          t("library.defaultMyreaderName"),
        )
        libraryId = created.id
      }
      const outcome = await api.importBook(
        libraryId,
        selected as string,
        null,
        [t("bookDetail.unknownAuthor")],
      )
      void queryClient.invalidateQueries({
        queryKey: pendingBookUploadKeys.list(libraryId),
      })
      void queryClient.invalidateQueries({
        queryKey: specialBookCollectionKeys.catalog(libraryId),
      })
      void queryClient.invalidateQueries({
        queryKey: localOnlyBookKeys.status(libraryId),
      })
      if (outcome.queued) {
        toast.info(t("library.importQueued"))
        return
      }
      resetBrokenCovers()
      queryClient.setQueryData<LibraryRecord[]>(libraryKeys.all, (current) =>
        current?.map((library) =>
          library.id === libraryId
            ? { ...library, bookCount: library.bookCount + 1 }
            : library,
        ),
      )
      refresh()
    } catch (error) {
      toast.error(t("library.importFailed"), {
        description: formatApiError(error),
      })
    } finally {
      setImportingBook(false)
    }
  }

  const collectionDefinition =
    getDesktopBookCollectionDefinition(activeCollectionId)
  const sectionLabel = t(collectionDefinition.titleKey)

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

  const handleDeleteBook = useCallback(async () => {
    if (!bookPendingDeletion || deletingBook) return

    setDeletingBook(true)
    try {
      await api.deleteBook(activeLibraryId, bookPendingDeletion.id)
      setBookPendingDeletion(null)
      if (String(bookPendingDeletion.id) === activeBookId) {
        handleBackToList()
      }
      handleCatalogChanged()
    } catch (error) {
      toast.error(t("bookDetail.deleteBookFailed"), {
        description: formatApiError(error),
      })
    } finally {
      setDeletingBook(false)
    }
  }, [
    activeBookId,
    activeLibraryId,
    bookPendingDeletion,
    deletingBook,
    handleBackToList,
    handleCatalogChanged,
    t,
  ])

  const hasNoLibrary = libraries.length === 0
  const emptyState = (() => {
    if (searchQuery) {
      return {
        title: t("library.noMatch.search.title"),
        detail: t("library.noMatch.search.detail"),
      }
    }

    const key: Exclude<BuiltInBookCollectionId, "all"> | "empty" =
      activeCollectionId === "all" ? "empty" : activeCollectionId
    switch (key) {
      case "recentlyRead":
        return {
          title: t("library.noMatch.recentlyRead.title"),
          detail: t("library.noMatch.recentlyRead.detail"),
        }
      case "favorites":
        return {
          title: t("library.noMatch.favorites.title"),
          detail: t("library.noMatch.favorites.detail"),
        }
      case "downloaded":
        return {
          title: t("library.noMatch.downloaded.title"),
          detail: t("library.noMatch.downloaded.detail"),
        }
      case "downloading":
        return {
          title: t("library.noMatch.downloading.title"),
          detail: t("library.noMatch.downloading.detail"),
        }
      case "uploading":
        return {
          title: t("library.noMatch.uploading.title"),
          detail: t("library.noMatch.uploading.detail"),
        }
      case "localOnly":
        return {
          title: t("library.noMatch.localOnly.title"),
          detail: t("library.noMatch.localOnly.detail"),
        }
      case "empty":
        return {
          title: t("library.noMatch.empty.title"),
          detail: t("library.noMatch.empty.detail"),
        }
    }
  })()
  const EmptyCollectionIcon = collectionDefinition.icon

  const gridHeader = (
    <div className="flex items-baseline gap-2.5 mb-4 pt-5">
      <h2 className="text-xl font-semibold">{sectionLabel}</h2>
      <span className="text-sm text-muted-foreground font-normal">
        {t("library.collections.bookCount", { count: displayedTotal })}
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
            canImportBook={activeLibrary?.libraryType === "myreader"}
            importingBook={importingBook}
            onImportBook={() => void handleImportBook()}
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
              <EmptyContent className="flex-row">
                <Button
                  size="sm"
                  disabled={importingBook}
                  onClick={() => void handleImportBook()}
                >
                  {importingBook
                    ? t("library.importingBook")
                    : t("library.empty.importBook")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate({ to: "/settings" })}
                >
                  {t("library.empty.addLibrary")}
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
                  onDeleteBook={
                    activeLibrary?.libraryType === "myreader"
                      ? setBookPendingDeletion
                      : undefined
                  }
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
                    <EmptyCollectionIcon />
                  </EmptyMedia>
                  <EmptyTitle>{emptyState.title}</EmptyTitle>
                  <EmptyDescription>{emptyState.detail}</EmptyDescription>
                </EmptyHeader>
                {activeLibrary?.libraryType === "myreader" &&
                  activeCollectionId === "all" &&
                  !searchQuery && (
                    <EmptyContent>
                      <Button
                        size="sm"
                        disabled={importingBook}
                        onClick={() => void handleImportBook()}
                      >
                        {importingBook
                          ? t("library.importingBook")
                          : t("library.empty.importBook")}
                      </Button>
                    </EmptyContent>
                  )}
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
              onLibraryChanged={handleCatalogChanged}
              onDeleteBook={setBookPendingDeletion}
            />
          </aside>
        ) : null}
      </div>

      <LibraryStatusBar activeLibrary={activeLibrary} onSync={handleRefresh} />

      <Dialog
        open={bookPendingDeletion != null}
        onOpenChange={(open) => {
          if (!open && !deletingBook) setBookPendingDeletion(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("bookDetail.deleteBookTitle", {
                title: bookPendingDeletion?.title ?? "",
              })}
            </DialogTitle>
            <DialogDescription>
              {t("bookDetail.deleteBookDescription")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={deletingBook}
              onClick={() => setBookPendingDeletion(null)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deletingBook}
              onClick={() => void handleDeleteBook()}
            >
              {deletingBook
                ? t("bookDetail.deletingBook")
                : t("bookDetail.confirmDeleteBook")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}

function LibraryStatusBar({
  activeLibrary,
  onSync,
}: {
  activeLibrary: LibraryRecord | null
  onSync: () => Promise<void>
}) {
  const { t } = useTranslation()

  return (
    <footer className="flex h-8 shrink-0 items-center justify-between border-t border-border bg-background px-2 pb-px text-xs text-muted-foreground">
      <span>
        {activeLibrary?.name ?? t("sidebar.noLibrary")} /{" "}
        {t("library.collections.bookCount", {
          count: activeLibrary?.bookCount ?? 0,
        })}
      </span>
      <LibrarySyncStatus library={activeLibrary} onSync={onSync} />
    </footer>
  )
}
