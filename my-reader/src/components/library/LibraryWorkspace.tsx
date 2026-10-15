import { useCatalogWorkspace } from "@/hooks/useCatalogWorkspace"
import { CatalogDirectory } from "./CatalogDirectory"
import type { CalibreBook } from "@my-reader/tools/types/book"
import type { Library as LibraryRecord } from "@my-reader/tools/types/library"
import {
  isRemoteLibrarySourceType,
  libraryTypeOf,
} from "@my-reader/tools/types/library"
import { useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { open } from "@tauri-apps/plugin-dialog"
import { type ReactNode, useCallback, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import AppTitleBar from "@/components/common/AppTitleBar"
import LibrarySyncStatus from "@/components/library/LibrarySyncStatus"
import Toolbar from "@/components/library/Toolbar"
import { Button } from "@/components/ui/button"
import { SidebarInset } from "@/components/ui/sidebar"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  type BookFileStateLookup,
  bookFileStateKeys,
  useBookFileStates,
} from "@/hooks/queries/useBookFileState"
import { useBookReadingFormats } from "@/hooks/queries/useBookReadingFormatsQuery"
import { invalidateFavoriteBookQueries } from "@/hooks/queries/useFavoriteBooksQuery"
import {
  libraryKeys,
  useLibrariesQuery,
} from "@/hooks/queries/useLibrariesQuery"
import { localOnlyBookKeys } from "@/hooks/queries/useLocalOnlyBooksQuery"
import { pendingBookUploadKeys } from "@/hooks/queries/usePendingBookUploadsQuery"
import {
  readingProgressKeys,
  useBookReadingProgress,
} from "@/hooks/queries/useReadingProgressQuery"
import { specialBookCollectionKeys } from "@/hooks/queries/useSpecialBookCollectionQuery"
import { useOpenReader } from "@/hooks/reader/useOpenReader"
import { useLibraryCollectionBooks } from "@/hooks/queries/useLibraryCollectionBooks"
import { useWindowSizeClass } from "@/hooks/use-window-size-class"
import { useDebouncedValue } from "@/hooks/useDebouncedValue"
import { resetBrokenCovers } from "@/lib/coverFailureCache"
import { api, formatApiError } from "@/lib/tauri-api"
import { errorMessage } from "@/lib/error-presentation"
import { cn } from "@/lib/utils"
import { useAppUiStore } from "@/stores/appUiStore"
import { useLibraryUiStore } from "@/stores/libraryUiStore"
import BookDetailPane from "./BookDetailPane"
import BookDetailTitleBar from "./BookDetailTitleBar"
import {
  LibraryCollectionContent,
  LibraryCollectionEmpty,
} from "./LibraryCollectionContent"

interface LibraryWorkspaceProps {
  activeBookId: string | null
  onAddLibrary: () => void
  sidebar: ReactNode
  settings: ReactNode
}

const EMPTY_SELECTED_FORMATS: Record<string, string> = {}
type DeletableBook = Pick<CalibreBook, "id" | "title">

export default function LibraryWorkspace({
  activeBookId,
  onAddLibrary,
  sidebar,
  settings,
}: LibraryWorkspaceProps) {
  const { t } = useTranslation()
  const { data: libraries = [], isLoading: libLoading } = useLibrariesQuery()
  const activeLibraryId = useLibraryUiStore((s) => s.activeLibraryId)
  const setActiveCollectionId = useLibraryUiStore(
    (s) => s.setActiveCollectionId,
  )
  const {
    catalog,
    tokens,
    directory,
    collectionId: activeCollectionId,
    searchQuery,
    sortBy,
    setSearchQuery,
    setSortBy,
    browseFacet,
    back: handleBackToList,
    onBack,
    setTokens,
    emptySearch,
    scrollKey,
    navigation,
  } = useCatalogWorkspace(activeLibraryId)
  const activeLibrary = libraries.find((l) => l.id === activeLibraryId) ?? null
  const isManagedLibrary = Boolean(
    activeLibrary && libraryTypeOf(activeLibrary) === "myreader",
  )
  const isRemoteLibrary = isRemoteLibrarySourceType(activeLibrary?.sourceType)
  const fileActionsEnabled = isRemoteLibrary
  const { data: selectedFormatById = EMPTY_SELECTED_FORMATS } =
    useBookReadingFormats(activeLibraryId)
  const { data: progressByBookId = {} } =
    useBookReadingProgress(activeLibraryId)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const openReader = useOpenReader()
  const windowSizeClass = useWindowSizeClass()
  const [importingBook, setImportingBook] = useState(false)
  const [bookPendingDeletion, setBookPendingDeletion] =
    useState<DeletableBook | null>(null)
  const [deletingBook, setDeletingBook] = useState(false)
  const [detailBackdropHost, setDetailBackdropHost] =
    useState<HTMLDivElement | null>(null)
  const [closedDetail, setClosedDetail] = useState<{
    bookId: string
    libraryId: string | null
  } | null>(null)

  const viewMode = useAppUiStore((s) => s.libraryViewMode)
  const setViewMode = useAppUiStore((s) => s.setLibraryViewMode)
  const detailFullScreen = useAppUiStore((s) => s.detailFullScreen)
  const setDetailFullScreen = useAppUiStore((s) => s.setDetailFullScreen)
  const {
    isSplitMode,
    showListPane,
    listPaneClassName,
    isDetailOverlay,
    showDetailPane,
    forceNarrowDetailHero,
    canToggleDetailFullScreen,
  } = getWorkspaceLayout(activeBookId, windowSizeClass, detailFullScreen)

  const debouncedSearch = useDebouncedValue(searchQuery, 300)
  const {
    collection,
    isPaginatedCollection,
    refreshCatalog: refresh,
  } = useLibraryCollectionBooks({
    libraryId: activeLibraryId,
    collectionId: activeCollectionId,
    sortBy,
    search: debouncedSearch,
    tokens,
    selectedFormatById,
    isManagedLibrary,
    isRemoteLibrary,
  })
  const {
    books: displayedBooks,
    total: displayedTotal,
    initialLoading: displayedLoading,
    error: displayedError,
  } = collection
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
    void queryClient.invalidateQueries({
      queryKey: ["catalogNavigation", activeLibraryId],
    })
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
          queryKey: ["catalogNavigation", activeLibraryId],
        }),
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
    if (importingBook || !activeLibraryId) return
    try {
      const selected = await open({
        directory: false,
        multiple: false,
        title: t("library.importBook"),
      })
      if (!selected) return

      setImportingBook(true)
      const libraryId = activeLibraryId
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
      void queryClient.invalidateQueries({
        queryKey: ["catalogNavigation", libraryId],
      })
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
        description: errorMessage(error),
      })
    } finally {
      setImportingBook(false)
    }
  }

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
      search: { catalog },
    })
  }

  function handleToggleDetail() {
    if (activeBookId) {
      setClosedDetail({ bookId: activeBookId, libraryId: activeLibraryId })
      handleBackToList()
    } else if (closedDetail?.libraryId === activeLibraryId) {
      navigate({
        to: "/book/$bookId",
        params: { bookId: closedDetail.bookId },
        search: { catalog },
      })
    }
  }

  const handleBrowseAllBooks = useCallback(() => {
    setActiveCollectionId("all")
    navigate({ to: "/" })
  }, [navigate, setActiveCollectionId])

  const handleDeleteBook = useCallback(async () => {
    if (!bookPendingDeletion || deletingBook) return

    setDeletingBook(true)
    try {
      await api.deleteBook(activeLibraryId, bookPendingDeletion.id)
      setClosedDetail((detail) =>
        detail?.libraryId === activeLibraryId &&
        detail.bookId === String(bookPendingDeletion.id)
          ? null
          : detail,
      )
      setBookPendingDeletion(null)
      if (String(bookPendingDeletion.id) === activeBookId) {
        handleBackToList()
      }
      handleCatalogChanged()
    } catch (error) {
      toast.error(t("bookDetail.deleteBookFailed"), {
        description: errorMessage(error),
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

  return (
    <section
      className={cn(
        "flex min-h-0 flex-1 flex-col overflow-hidden bg-background",
        isSplitMode && "[&_[data-testid=library-scroll]]:px-5",
      )}
    >
      <AppTitleBar
        showSidebarToggle={!settings}
        detailVisible={showDetailPane}
        libraryControls={
          showListPane ? (
            <Toolbar
              directory={directory}
              onBack={onBack}
              tokens={tokens}
              navigation={navigation.data}
              onTokensChange={setTokens}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              sortBy={sortBy}
              onSortChange={setSortBy}
              canImportBook={isManagedLibrary}
              importingBook={importingBook}
              onImportBook={() => void handleImportBook()}
            />
          ) : null
        }
        detailControls={
          showDetailPane ||
          (closedDetail && closedDetail.libraryId === activeLibraryId) ? (
            <BookDetailTitleBar
              onBackToList={handleBackToList}
              fullScreenAvailable={canToggleDetailFullScreen}
              detailFullScreen={detailFullScreen}
              onToggleDetailFullScreen={() =>
                setDetailFullScreen(!detailFullScreen)
              }
              detailVisible={showDetailPane}
              onToggleDetail={handleToggleDetail}
            />
          ) : null
        }
      />
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {sidebar}
        <SidebarInset className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div
            ref={setDetailBackdropHost}
            className="relative isolate flex min-h-0 flex-1 overflow-hidden"
            data-testid="library-content"
          >
            <div
              data-testid="library-pane"
              aria-hidden={!showListPane}
              className={listPaneClassName}
            >
              {directory ? (
                <CatalogDirectory
                  kind={directory}
                  navigation={navigation.data}
                  libraryId={activeLibraryId}
                  search={searchQuery}
                  viewMode={viewMode}
                  loading={navigation.isLoading}
                  error={navigation.error}
                  onRetry={() => void navigation.refetch()}
                  onSelect={browseFacet}
                />
              ) : (
                <LibraryCollectionContent
                  key={scrollKey}
                  loading={loading}
                  error={displayedError}
                  hasNoLibrary={libraries.length === 0}
                  onAddLibrary={onAddLibrary}
                  onRetry={collection.refresh}
                  emptyState={
                    <LibraryCollectionEmpty
                      activeCollectionId={activeCollectionId}
                      searchQuery={emptySearch}
                      isManagedLibrary={isManagedLibrary}
                      importingBook={importingBook}
                      onImportBook={handleImportBook}
                      onBrowseAllBooks={handleBrowseAllBooks}
                    />
                  }
                  gridProps={{
                    scrollKey,
                    books: displayedBooks,
                    total: displayedTotal,
                    libraryId: activeLibraryId,
                    onRead: handleOpenDetail,
                    onOpenReader: handleOpenReader,
                    onDeleteBook: isManagedLibrary
                      ? setBookPendingDeletion
                      : undefined,
                    ensureRange: collection.ensureRange,
                    viewMode,
                    fileActionsEnabled,
                    selectedFormatById,
                    progressByBookId,
                    activeBookId,
                  }}
                />
              )}
            </div>

            {showDetailPane ? (
              <aside
                className={cn(
                  "flex min-w-0 flex-1 flex-col p-0",
                  isSplitMode && "w-1/2 flex-none",
                  isDetailOverlay
                    ? "absolute inset-0 z-20"
                    : "relative z-10 animate-in fade-in-0 duration-150",
                )}
                data-testid="book-detail-shell"
              >
                <BookDetailPane
                  bookId={activeBookId!}
                  onBrowse={browseFacet}
                  onBackToList={handleBackToList}
                  forceNarrowHero={forceNarrowDetailHero}
                  wideBackdropHost={detailBackdropHost}
                  onLibraryChanged={handleCatalogChanged}
                  onDeleteBook={setBookPendingDeletion}
                />
              </aside>
            ) : null}
          </div>

          <LibraryStatusBar
            activeLibrary={activeLibrary}
            onSync={handleRefresh}
          />
        </SidebarInset>
        {settings ? (
          <div className="absolute inset-0 z-50 bg-background animate-in fade-in-0 duration-150">
            {settings}
          </div>
        ) : null}
      </div>

      <DeleteBookDialog
        book={bookPendingDeletion}
        deleting={deletingBook}
        onDismiss={() => setBookPendingDeletion(null)}
        onConfirm={handleDeleteBook}
      />
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

function getWorkspaceLayout(
  activeBookId: string | null,
  windowSizeClass: ReturnType<typeof useWindowSizeClass>,
  detailFullScreen: boolean,
) {
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

  const listPaneClassName = cn(
    "flex min-w-0 flex-1 flex-col",
    showListPane
      ? "relative z-10"
      : "pointer-events-none invisible absolute top-0 bottom-0 start-0 z-0 h-full",
    keepsListSplitGeometry
      ? "w-1/2 max-w-none flex-none shrink-0"
      : showListPane
        ? "flex-1"
        : "end-0",
  )

  return {
    isSplitMode,
    showListPane,
    listPaneClassName,
    isDetailOverlay,
    showDetailPane,
    forceNarrowDetailHero,
    canToggleDetailFullScreen,
  }
}

function DeleteBookDialog({
  book,
  deleting,
  onDismiss,
  onConfirm,
}: {
  book: DeletableBook | null
  deleting: boolean
  onDismiss: () => void
  onConfirm: () => Promise<void>
}) {
  const { t } = useTranslation()
  return (
    <Dialog
      open={book != null}
      onOpenChange={(open) => {
        if (!open && !deleting) onDismiss()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("bookDetail.deleteBookTitle", {
              title: book?.title ?? "",
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
            disabled={deleting}
            onClick={() => onDismiss()}
          >
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={deleting}
            onClick={() => void onConfirm()}
          >
            {deleting
              ? t("bookDetail.deletingBook")
              : t("bookDetail.confirmDeleteBook")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
