import {
  ArrowUpDown,
  BookPlus,
  Check,
  ChevronDown,
  LayoutGrid,
  List,
  Loader2,
  RefreshCw,
  Search,
  SlidersHorizontal,
} from "lucide-react"
import { useTranslation } from "react-i18next"

import { Button, buttonVariants } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import type { LibrarySortOption } from "@/types/libraryUi"
import AppSidebarToggle from "./AppSidebarToggle"

function useSortLabels(): Record<LibrarySortOption, string> {
  const { t } = useTranslation()
  return {
    recent: t("library.sort.recent"),
    title: t("library.sort.title"),
    author: t("library.sort.author"),
    progress: t("library.sort.progress"),
  }
}

interface ToolbarProps {
  searchQuery: string
  onSearchChange: (q: string) => void
  viewMode: "grid" | "list"
  onViewModeChange: (mode: "grid" | "list") => void
  sortBy: LibrarySortOption
  onSortChange: (sort: LibrarySortOption) => void
  onRefresh?: () => void
  canImportBook?: boolean
  importingBook?: boolean
  onImportBook?: () => void
}

export default function Toolbar({
  searchQuery,
  onSearchChange,
  viewMode,
  onViewModeChange,
  sortBy,
  onSortChange,
  onRefresh,
  canImportBook = false,
  importingBook = false,
  onImportBook,
}: ToolbarProps) {
  const { t } = useTranslation()
  const sortLabels = useSortLabels()

  const sortOptions: LibrarySortOption[] = [
    "recent",
    "title",
    "author",
    "progress",
  ]

  return (
    <header className="toolbar-shell flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background px-4">
      <AppSidebarToggle />

      {/* Search */}
      <div className="relative flex-1 max-w-sm">
        <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
        <Input
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t("library.searchPlaceholder")}
          className="ps-8 h-8 bg-card border-border"
        />
      </div>

      <div className="ms-auto flex items-center gap-1">
        {canImportBook && (
          <Button
            variant="ghost"
            size="icon-sm"
            title={t("library.importBook")}
            aria-label={t("library.importBook")}
            disabled={importingBook}
            onClick={onImportBook}
          >
            {importingBook ? (
              <Loader2 className="animate-spin" />
            ) : (
              <BookPlus />
            )}
          </Button>
        )}

        {/* View toggle */}
        <Button
          variant="ghost"
          size="icon-sm"
          title={t("library.gridView")}
          className={cn(
            viewMode === "grid" && "bg-accent text-accent-foreground",
          )}
          onClick={() => onViewModeChange("grid")}
        >
          <LayoutGrid />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          title={t("library.listView")}
          className={cn(
            viewMode === "list" && "bg-accent text-accent-foreground",
          )}
          onClick={() => onViewModeChange("list")}
        >
          <List />
        </Button>

        <Separator orientation="vertical" className="h-4 mx-1" />

        {/* Sort */}
        <DropdownMenu>
          <DropdownMenuTrigger
            title={sortLabels[sortBy]}
            aria-label={sortLabels[sortBy]}
            className={cn(
              buttonVariants({
                variant: "ghost",
                size: "sm",
                className: "toolbar-sort-trigger h-8 gap-1 bg-card/60",
              }),
            )}
          >
            <ArrowUpDown className="size-3.5" />
            <span className="toolbar-sort-label text-xs">
              {sortLabels[sortBy]}
            </span>
            <ChevronDown className="toolbar-sort-chevron size-3 opacity-50" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-36">
            {sortOptions.map((option) => (
              <DropdownMenuItem
                key={option}
                onClick={() => onSortChange(option)}
                className="gap-2"
              >
                <Check
                  className={cn(
                    "size-3.5",
                    option === sortBy ? "opacity-100" : "opacity-0",
                  )}
                />
                {sortLabels[option]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Filter */}
        <Button variant="ghost" size="icon-sm" title={t("library.filter")}>
          <SlidersHorizontal />
        </Button>

        <Separator orientation="vertical" className="h-4 mx-1" />

        {/* Refresh */}
        <Button
          variant="ghost"
          size="icon-sm"
          title={t("library.syncLibrary")}
          onClick={onRefresh}
        >
          <RefreshCw className="size-4" />
        </Button>
      </div>
    </header>
  )
}
