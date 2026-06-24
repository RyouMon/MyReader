import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { AlertCircle, BookOpen, Library } from "lucide-react"
import type { CalibreBook } from "@my-reader/tools/types/book"
import { useState } from "react"
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
import { api } from "@/lib/tauri-api"
import { cn } from "@/lib/utils"
import { useAppUiStore } from "@/stores/appUiStore"
import { useLibraryMutations, useLibrariesQuery } from "@/hooks/queries/useLibrariesQuery"
import { useLibraryUiStore } from "@/stores/libraryUiStore"

export const Route = createFileRoute("/_layout/")({
  component: LibraryPage,
})

function LibraryPage() {
  const { t } = useTranslation()
  const { data: libraries = [], isLoading: libLoading } = useLibrariesQuery()
  const { refreshLibrary } = useLibraryMutations()
  const activeLibraryId = useLibraryUiStore((s) => s.activeLibraryId)
  const activeLibrary = libraries.find((l) => l.id === activeLibraryId) ?? null
  const navigate = useNavigate()

  const activeView = "all" as const
  const [searchQuery, setSearchQuery] = useState("")
  const viewMode = useAppUiStore((s) => s.libraryViewMode)
  const setViewMode = useAppUiStore((s) => s.setLibraryViewMode)
  const [sortBy, setSortBy] = useState<SortOption>("recent")

  const debouncedSearch = useDebouncedValue(searchQuery, 300)

  const { books, total, initialLoading, error, ensureRange, refresh } =
    usePaginatedBooks(activeLibraryId, sortBy, debouncedSearch)

  const loading = libLoading || initialLoading

  const handleRefresh = async () => {
    if (!activeLibraryId) return
    try {
      await refreshLibrary(activeLibraryId)
      refresh()
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
    activeView === "all"
      ? t("library.title")
      : activeView === "favorites"
        ? t("library.favoritesTitle")
        : t("library.recentTitle")

  function handleRead(book: CalibreBook) {
    navigate({
      to: "/book/$bookId",
      params: { bookId: String(book.id) },
    })
  }

  const hasNoLibrary = libraries.length === 0

  const gridHeader = (
    <div className="flex items-baseline gap-2.5 mb-4 pt-5">
      <h2 className="font-serif text-xl font-semibold">{sectionLabel}</h2>
      <span className="text-sm text-muted-foreground font-normal">
        {t("library.booksCount", { count: total })}
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

      {loading && !error && <LibrarySkeletonGrid viewMode={viewMode} />}

      {!loading && error && (
        <Empty className="min-h-0 flex-1">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <AlertCircle className="text-destructive" />
            </EmptyMedia>
            <EmptyTitle>{t("library.loadingFailed")}</EmptyTitle>
            <EmptyDescription>{error}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" size="sm" onClick={refresh}>
              {t("common.retry")}
            </Button>
          </EmptyContent>
        </Empty>
      )}

      {!loading && !error && hasNoLibrary && (
        <Empty className="min-h-0 flex-1">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Library />
            </EmptyMedia>
            <EmptyTitle>{t("library.empty.noLibraryTitle")}</EmptyTitle>
            <EmptyDescription>{t("library.empty.noLibraryDesc")}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button
              size="sm"
              onClick={() => navigate({ to: "/settings" })}
            >
              {t("library.empty.goToSettings")}
            </Button>
          </EmptyContent>
        </Empty>
      )}

      {!loading && !error && !hasNoLibrary && total > 0 && (
        <BookGrid
          books={books}
          total={total}
          libraryId={activeLibraryId}
          onRead={handleRead}
          ensureRange={ensureRange}
          header={gridHeader}
          viewMode={viewMode}
        />
      )}

      {!loading && !error && !hasNoLibrary && total === 0 && (
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
