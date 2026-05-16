import {
  ArrowUpDown,
  ChevronDown,
  LayoutGrid,
  List,
  RefreshCw,
  Search,
  SlidersHorizontal,
} from "lucide-react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

export type SortOption = "recent" | "title" | "author" | "progress"

function useSortLabels(): Record<SortOption, string> {
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
  sortBy: SortOption
  onSortChange: (sort: SortOption) => void
  onRefresh?: () => void
}

export default function Toolbar({
  searchQuery,
  onSearchChange,
  viewMode,
  onViewModeChange,
  sortBy,
  onSortChange,
  onRefresh,
}: ToolbarProps) {
  const { t } = useTranslation()
  const sortLabels = useSortLabels()

  function cycleSortOption() {
    const options: SortOption[] = ["recent", "title", "author", "progress"]
    const next = options[(options.indexOf(sortBy) + 1) % options.length]
    onSortChange(next)
  }

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background px-4">
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
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1"
          onClick={cycleSortOption}
        >
          <ArrowUpDown className="size-3.5" />
          <span className="text-xs">{sortLabels[sortBy]}</span>
          <ChevronDown className="size-3 opacity-50" />
        </Button>

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
