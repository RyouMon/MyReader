import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { BookX, Loader2 } from "lucide-react"
import { useState } from "react"
import BookGrid from "@/components/library/BookGrid"
import Toolbar, { type SortOption } from "@/components/library/Toolbar"
import { useAppUiStore } from "@/stores/appUiStore"
import { useLibrary } from "@/stores/libraryStore"
import { useDebouncedValue } from "@/hooks/useDebouncedValue"
import { usePaginatedBooks } from "@/hooks/reader/usePaginatedBooks"
import { cn } from "@/lib/utils"
import type { CalibreBook } from "my-reader-tools/types/book"

export const Route = createFileRoute("/_layout/")({
  component: LibraryPage,
})

function LibraryPage() {
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

  const loading = libLoading || initialLoading

  const handleRefresh = async () => {
    if (!activeLibraryId) return
    try {
      await refreshLibrary(activeLibraryId)
      refresh()
    } catch (e) {
      console.error("Failed to refresh library:", e)
    }
  }

  const sectionLabel =
    activeView === "all"
      ? "全部书籍"
      : activeView === "favorites"
        ? "收藏书籍"
        : "最近阅读"

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
        {total} 本
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

      {loading && (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="size-8 animate-spin" />
          <p className="text-sm">正在加载书库…</p>
        </div>
      )}

      {!loading && error && (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 text-center text-destructive">
          <p className="text-base font-medium">加载失败</p>
          <p className="text-sm opacity-80 max-w-md">{error}</p>
        </div>
      )}

      {!loading && !error && hasNoLibrary && (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 text-center text-muted-foreground">
          <BookX className="size-12 opacity-40" />
          <p className="text-base font-medium">尚未添加书库</p>
          <p className="text-sm opacity-60">
            请前往设置 → 书库管理添加 Calibre 书库目录
          </p>
          <button
            type="button"
            onClick={() => navigate({ to: "/settings" })}
            className="mt-2 text-sm text-primary hover:underline"
          >
            前往设置
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
          <p className="text-base">没有找到匹配的书籍</p>
          <p className="text-sm mt-1 opacity-60">
            {searchQuery ? "试试其他关键词" : "书库中暂无书籍"}
          </p>
        </div>
      )}

      <footer className="flex items-center justify-between px-6 py-2 text-xs text-muted-foreground shrink-0 border-t border-border bg-background">
        <span>
          📚 {activeLibrary?.name ?? "未选择书库"} ·{" "}
          {(activeLibrary?.bookCount ?? 0).toLocaleString()} 本
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
          {activeLibrary ? "已连接" : "未连接"}
        </div>
      </footer>
    </>
  )
}
