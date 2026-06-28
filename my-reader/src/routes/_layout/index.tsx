import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { AlertCircle, BookOpen, Library } from "lucide-react"
import type { CalibreBook } from "@my-reader/tools/types/book"
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import BookGrid, { LibrarySkeletonGrid } from "@/components/library/BookGrid"
import Toolbar, { type SortOption } from "@/components/library/Toolbar"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { usePaginatedBooks } from "@/hooks/reader/usePaginatedBooks"
import { useDebouncedValue } from "@/hooks/useDebouncedValue"
import { useFavoriteBooks } from "@/hooks/queries/useFavoriteBooksQuery"
import { api } from "@/lib/tauri-api"
import { cn } from "@/lib/utils"
import { useAppUiStore } from "@/stores/appUiStore"
import {
  useLibraryMutations,
  useLibrariesQuery,
} from "@/hooks/queries/useLibrariesQuery"
import { useLibraryUiStore } from "@/stores/libraryUiStore"

export const Route = createFileRoute("/_layout/")({
  component: LibraryPage,
})

function LibraryPage() {
  const { t } = useTranslation()
  const { data: libraries = [], isLoading: libLoading } = useLibrariesQuery()
  const { refreshLibrary } = useLibraryMutations()
  const activeLibraryId = useLibraryUiStore((s) => s.activeLibraryId)
  const activeView = useLibraryUiStore((s) => s.activeView)
  const activeLibrary = libraries.find((l) => l.id === activeLibraryId) ?? null
  const navigate = useNavigate()

  const [searchQuery, setSearchQuery] = useState("")
  const viewMode = useAppUiStore((s) => s.libraryViewMode)
  const setViewMode = useAppUiStore((s) => s.setLibraryViewMode)
  const [sortBy, setSortBy] = useState<SortOption>("recent")

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

  const handleRefresh = async () => {
    if (!activeLibraryId) return
    try {
      await refreshLibrary(activeLibraryId)
      refresh()
      void favoriteBooksQuery.refetch()
    } catch (e) {
      console.error("Failed to refresh library:", e)
    }
    try {
      await api.syncDbForLibrary(activeLibraryId)
    } catch (e) {
      console.error("Failed to sync db:", e)
    }
  }

  const sectionLabel =
    activeView === "favorites"
      ? t("library.favoritesTitle")
      : activeView === "recent"
        ? t("library.recentTitle")
        : t("library.title")

  function handleRead(book: CalibreBook) {
    navigate({
      to: "/book/$bookId",
      params: { bookId: String(book.id) },
    })
  }

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
    <>
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

      {!loading && !displayedError && !hasNoLibrary && displayedTotal > 0 && (
        <BookGrid
          books={displayedBooks}
          total={displayedTotal}
          libraryId={activeLibraryId}
          onRead={handleRead}
          ensureRange={displayedEnsureRange}
          header={gridHeader}
          viewMode={viewMode}
        />
      )}

      {!loading && !displayedError && !hasNoLibrary && displayedTotal === 0 && (
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

      <footer className="flex items-center justify-between px-6 py-2 text-xs text-muted-foreground shrink-0 border-t border-border bg-background">
        <span>
          📚 {activeLibrary?.name ?? t("sidebar.noLibrary")} ·{" "}
          {t("sidebar.booksCount", { count: activeLibrary?.bookCount ?? 0 })}
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
    </>
  )
}
