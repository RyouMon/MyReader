import {
  ArrowUpDown,
  ChevronDown,
  LayoutGrid,
  List,
  Search,
  SlidersHorizontal,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"

export type SortOption = "recent" | "title" | "author" | "progress"

const SORT_LABELS: Record<SortOption, string> = {
  recent: "最近添加",
  title: "书名",
  author: "作者",
  progress: "进度",
}

interface ToolbarProps {
  searchQuery: string
  onSearchChange: (q: string) => void
  viewMode: "grid" | "list"
  onViewModeChange: (mode: "grid" | "list") => void
  sortBy: SortOption
  onSortChange: (sort: SortOption) => void
}

export default function Toolbar({
  searchQuery,
  onSearchChange,
  viewMode,
  onViewModeChange,
  sortBy,
  onSortChange,
}: ToolbarProps) {
  function cycleSortOption() {
    const options: SortOption[] = ["recent", "title", "author", "progress"]
    const next = options[(options.indexOf(sortBy) + 1) % options.length]
    onSortChange(next)
  }

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 h-4" />

      {/* Search */}
      <div className="relative flex-1 max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
        <Input
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="搜索书名、作者、标签…"
          className="pl-8 h-8 bg-card border-border"
        />
      </div>

      <div className="ml-auto flex items-center gap-1">
        {/* View toggle */}
        <Button
          variant="ghost"
          size="icon-sm"
          title="网格视图"
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
          title="列表视图"
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
          <span className="text-xs">{SORT_LABELS[sortBy]}</span>
          <ChevronDown className="size-3 opacity-50" />
        </Button>

        {/* Filter */}
        <Button variant="ghost" size="icon-sm" title="筛选">
          <SlidersHorizontal />
        </Button>
      </div>
    </header>
  )
}
