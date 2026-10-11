import {
  ArrowUpDown,
  BookPlus,
  Check,
  ChevronDown,
  LayoutGrid,
  List,
  Loader2,
  Search,
} from "lucide-react"
import { useTranslation } from "react-i18next"

import { Button, buttonVariants } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import type { LibrarySortOption } from "@/types/libraryUi"

const SEARCH_INPUT_CLASS =
  "h-8 border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent"

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
    <div
      data-tauri-drag-region
      className="toolbar-shell flex h-full min-w-0 flex-1 items-center gap-2 px-2 text-muted-foreground"
    >
      {/* Search */}
      <div className="toolbar-search-field relative min-w-0 flex-1 max-w-sm rounded-md transition-colors hover:bg-accent/50 focus-within:bg-accent/50">
        <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
        <Input
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t("library.searchPlaceholder")}
          aria-label={t("library.searchPlaceholder")}
          className={cn(SEARCH_INPUT_CLASS, "ps-8")}
        />
      </div>
      <Popover>
        <PopoverTrigger
          className={cn(
            buttonVariants({
              variant: searchQuery ? "secondary" : "ghost",
              size: "icon-sm",
            }),
            "toolbar-search-trigger hidden",
          )}
          title={t("library.searchPlaceholder")}
          aria-label={t("library.searchPlaceholder")}
        >
          <Search />
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="border-0 p-1"
          aria-label={t("library.searchPlaceholder")}
        >
          <Input
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={t("library.searchPlaceholder")}
            aria-label={t("library.searchPlaceholder")}
            className={SEARCH_INPUT_CLASS}
          />
        </PopoverContent>
      </Popover>

      <div
        data-tauri-drag-region
        className="ms-auto flex shrink-0 items-center"
      >
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
          aria-label={t("library.gridView")}
          aria-pressed={viewMode === "grid"}
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
          aria-label={t("library.listView")}
          aria-pressed={viewMode === "list"}
          className={cn(
            viewMode === "list" && "bg-accent text-accent-foreground",
          )}
          onClick={() => onViewModeChange("list")}
        >
          <List />
        </Button>

        {/* Sort */}
        <DropdownMenu>
          <DropdownMenuTrigger
            title={sortLabels[sortBy]}
            aria-label={sortLabels[sortBy]}
            className={cn(
              buttonVariants({
                variant: "ghost",
                size: "sm",
                className: "toolbar-sort-trigger h-8 gap-1",
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
            <DropdownMenuGroup>
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
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
