import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { BookX } from "lucide-react"
import type { CalibreBook } from "@my-reader/tools/types/book"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import BookGrid, { LibrarySkeletonGrid } from "@/components/library/BookGrid"
import Toolbar, { type SortOption } from "@/components/library/Toolbar"
import { usePaginatedBooks } from "@/hooks/reader/usePaginatedBooks"
import { useSyncActions } from "@/hooks/sync/useSyncActions"
import { useDebouncedValue } from "@/hooks/useDebouncedValue"
import { cn } from "@/lib/utils"
import { useAppUiStore } from "@/stores/appUiStore"
import { useLibrary } from "@/stores/libraryStore"

export const Route = createFileRoute("/_layout/")({
  component: LibraryPage,
})

function LibraryPage() {
  const { t } = useTranslation()
  const {
    activeLibrary,
    activeLibraryId,
    loading: libLoading,
    libraries,
    refreshLibrary,
  } = useLibrary()
  const navigate = useNavigate()

  const activeView = "all" as const
  const [searchQuery, setSearchQuery] = useState("")
  const viewMode = useAppUiStore((s) => s.libraryViewMode)
  const setViewMode = useAppUiStore((s) => s.setLibraryViewMode)
  const [sortBy, setSortBy] = useState<SortOption>("recent")

  const debouncedSearch = useDebouncedValue(searchQuery, 300)

  const { books, total, initialLoading, error, ensureRange, refresh } =
    usePaginatedBooks(activeLibraryId, sortBy, debouncedSearch)
  const { syncDbForLibrary } = useSyncActions()

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
      await syncDbForLibrary(activeLibraryId)
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
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 text-center text-destructive">
          <p className="text-base font-medium">{t("library.loadingFailed")}</p>
          <p className="text-sm opacity-80 max-w-md">{error}</p>
        </div>
      )}

      {!loading && !error && hasNoLibrary && (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 text-center text-muted-foreground">
          <BookX className="size-12 opacity-40" />
          <p className="text-base font-medium">{t("library.empty.noLibraryTitle")}</p>
          <p className="text-sm opacity-60">
            {t("library.empty.noLibraryDesc")}
          </p>
          <button
            type="button"
            onClick={() => navigate({ to: "/settings" })}
            className="mt-2 text-sm text-primary hover:underline"
          >
            {t("library.empty.goToSettings")}
          </button>
        </div>
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
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center text-center text-muted-foreground">
          <p className="text-base">{t("library.empty.noBooks")}</p>
          <p className="text-sm mt-1 opacity-60">
            {searchQuery ? t("library.empty.tryOtherKeywords") : t("library.empty.noBooksInLibrary")}
          </p>
        </div>
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
