import { ArrowLeft, ChevronRight, Folder, Loader2, MoreHorizontal, RefreshCw } from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useTranslation } from "react-i18next"

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

export interface FolderBrowserFolder {
  name: string
  path: string
}

export interface FolderBrowserProps {
  title: string
  subtitle?: string
  open: boolean
  onOpenChange: (open: boolean) => void
  currentPath: string
  folders: FolderBrowserFolder[]
  loading: boolean
  error: string | null
  loadingMessage: string
  emptyMessage: string
  errorMessage: string
  selectLabel: string
  onNavigate: (path: string) => void
  onRefresh?: () => void
  onSelect: (path: string) => void
}

export function FolderBrowser({
  title,
  subtitle,
  open,
  onOpenChange,
  currentPath,
  folders,
  loading,
  error,
  loadingMessage,
  emptyMessage,
  errorMessage,
  selectLabel,
  onNavigate,
  onRefresh,
  onSelect,
}: FolderBrowserProps) {
  const { t } = useTranslation()

  const pathParts = currentPath === "/" ? [] : currentPath.split("/").filter(Boolean)
  const canGoBack = currentPath !== "/"

  const ITEMS_TO_DISPLAY = 3
  const shouldCollapse = pathParts.length + 1 > ITEMS_TO_DISPLAY
  const tailCount = ITEMS_TO_DISPLAY - 1
  const tailSegments = shouldCollapse ? pathParts.slice(-tailCount) : pathParts
  const hiddenSegments = shouldCollapse ? pathParts.slice(0, -tailCount) : []

  function handleBreadcrumbClick(index: number) {
    if (currentPath === "/") return
    if (index < 0 || index >= pathParts.length) return
    onNavigate(`/${pathParts.slice(0, index + 1).join("/")}/`)
  }

  function handleGoBack() {
    if (!canGoBack) return
    if (pathParts.length <= 1) {
      onNavigate("/")
    } else {
      onNavigate(`/${pathParts.slice(0, -1).join("/")}/`)
    }
  }

  function handleConfirm() {
    onSelect(currentPath)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-[calc(100vw-2rem)] sm:max-w-[480px] grid-cols-1 p-5 gap-0 border-border bg-bg-secondary">
        <DialogHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <DialogTitle className="text-base font-semibold text-ink-1">{title}</DialogTitle>
              {subtitle && (
                <DialogDescription className="text-[13px] text-ink-2">{subtitle}</DialogDescription>
              )}
            </div>
          </div>
        </DialogHeader>

        {/* Toolbar */}
        <div className="flex items-center gap-2 mb-3">
          <button
            type="button"
            disabled={!canGoBack || loading}
            onClick={handleGoBack}
            className={cn(
              "inline-flex items-center justify-center size-8 rounded-md border border-border bg-transparent text-ink-2 transition-colors",
              "hover:bg-hover-bg hover:text-ink-1",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              "disabled:opacity-40 disabled:pointer-events-none"
            )}
            aria-label={t("common.back")}
            title={t("common.back")}
          >
            <ArrowLeft className="size-4" />
          </button>

          <Breadcrumb aria-label="Breadcrumb" className="flex-1 min-w-0 text-[13px] font-medium overflow-hidden">
            <BreadcrumbList className="flex-nowrap overflow-hidden">
              <BreadcrumbItem>
                {pathParts.length === 0 ? (
                  <BreadcrumbPage dir="ltr" className="text-ink-1">/</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink
                    asChild
                    dir="ltr"
                    className="inline-flex shrink-0 items-center text-ink-2 transition-colors hover:text-primary"
                  >
                    <button type="button" onClick={() => onNavigate("/")}>/</button>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>

              {pathParts.length > 0 && <BreadcrumbSeparator />}

              {shouldCollapse && (
                <>
                  <BreadcrumbItem>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          data-testid="breadcrumb-ellipsis"
                          aria-label={t("common.more")}
                          className="inline-flex items-center justify-center rounded-sm text-ink-2 transition-colors hover:text-ink-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                        >
                          <MoreHorizontal className="size-3.5" />
                          <span className="sr-only">More</span>
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        {hiddenSegments.map((part, index) => (
                          <DropdownMenuItem
                            key={index}
                            onSelect={() => handleBreadcrumbClick(index)}
                            className="cursor-pointer"
                          >
                            {part}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                </>
              )}

              {tailSegments.map((part, localIndex) => {
                const actualIndex = shouldCollapse
                  ? pathParts.length - tailCount + localIndex
                  : localIndex
                const isLast = actualIndex === pathParts.length - 1

                return (
                  <>
                    <BreadcrumbItem key={actualIndex} className="min-w-0 overflow-hidden">
                      {isLast ? (
                        <BreadcrumbPage
                          dir="ltr"
                          className="truncate text-ink-1"
                        >
                          {part}
                        </BreadcrumbPage>
                      ) : (
                        <BreadcrumbLink
                          asChild
                          dir="ltr"
                          className="inline-flex shrink-0 items-center truncate text-ink-2 transition-colors hover:text-primary"
                        >
                          <button
                            type="button"
                            onClick={() => handleBreadcrumbClick(actualIndex)}
                          >
                            {part}
                          </button>
                        </BreadcrumbLink>
                      )}
                    </BreadcrumbItem>
                    {!isLast && <BreadcrumbSeparator key={`sep-${actualIndex}`} />}
                  </>
                )
              })}
            </BreadcrumbList>
          </Breadcrumb>

          {onRefresh && (
            <button
              type="button"
              disabled={loading}
              onClick={onRefresh}
              className={cn(
                "inline-flex items-center justify-center size-8 rounded-md border border-border bg-transparent text-ink-2 transition-colors",
                "hover:bg-hover-bg hover:text-ink-1",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                "disabled:opacity-40 disabled:pointer-events-none"
              )}
              aria-label={t("common.refresh")}
              title={t("common.refresh")}
            >
              <RefreshCw className={cn("size-4", loading && "animate-spin")} />
            </button>
          )}
        </div>

        {/* Folder list */}
        {loading ? (
          <div
            className={cn(
              "min-h-[220px] max-h-[320px] overflow-y-auto rounded-[var(--radius-lg)] border border-border p-1.5 bg-bg-secondary",
              "flex flex-col items-center justify-center h-[220px] text-ink-2 text-sm gap-2"
            )}
            role="status"
            aria-live="polite"
          >
            <Loader2 className="size-5 animate-spin" />
            <span>{loadingMessage}</span>
          </div>
        ) : error ? (
          <div
            className={cn(
              "min-h-[220px] max-h-[320px] overflow-y-auto rounded-[var(--radius-lg)] border border-border p-1.5 bg-bg-secondary",
              "flex flex-col items-center justify-center h-[220px] text-danger text-sm gap-2 px-4 text-center"
            )}
            role="alert"
          >
            <span>{error || errorMessage}</span>
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                className="inline-flex items-center gap-1.5 text-ink-2 hover:text-ink-1 transition-colors"
              >
                <RefreshCw className="size-3.5" />
                {t("common.retry")}
              </button>
            )}
          </div>
        ) : folders.length === 0 ? (
          <div
            className={cn(
              "min-h-[220px] max-h-[320px] overflow-y-auto rounded-[var(--radius-lg)] border border-border p-1.5 bg-bg-secondary",
              "flex flex-col items-center justify-center h-[220px] text-ink-2 text-sm gap-2"
            )}
          >
            <Folder className="size-8 opacity-40" />
            <span>{emptyMessage}</span>
          </div>
        ) : (
          <ul
            className={cn(
              "min-h-[220px] max-h-[320px] overflow-y-auto rounded-[var(--radius-lg)] border border-border p-1.5 bg-bg-secondary"
            )}
            aria-label={title}
          >
            {folders.map((folder, index) => (
              <li key={folder.path} className="list-none">
                <button
                  type="button"
                  onClick={() => onNavigate(folder.path)}
                  style={{ animationDelay: `${index * 20}ms` }}
                  className={cn(
                    "folder-browser-row flex items-center gap-3 w-full h-11 px-3 rounded-md text-left",
                    "text-sm text-ink-1 bg-transparent",
                    "hover:bg-hover-bg",
                    "active:scale-[0.995] transition-all",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  )}
                >
                  <Folder className="size-[18px] shrink-0 text-primary" />
                  <span className="flex-1 truncate">{folder.name}</span>
                  <ChevronRight className="size-4 shrink-0 text-ink-2" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <DialogFooter className="mt-4 pt-3 border-t border-border flex-col-reverse sm:flex-row sm:justify-between sm:items-start gap-3">
          <span className="flex-1 min-w-0 text-[13px] text-ink-2 whitespace-normal break-words">
            {t("addLibraryForm.selectedPath", { path: currentPath === "/" ? "/" : currentPath })}
          </span>
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className={cn(
                "inline-flex items-center justify-center h-9 px-4 rounded-md text-sm font-medium",
                "border border-border bg-transparent text-ink-1",
                "hover:bg-hover-bg transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              )}
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={handleConfirm}
              className={cn(
                "inline-flex items-center justify-center h-9 px-4 rounded-md text-sm font-medium",
                "bg-primary text-primary-foreground",
                "hover:brightness-105 transition-all",
                "active:scale-[0.98]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                "disabled:opacity-50 disabled:pointer-events-none"
              )}
            >
              {selectLabel}
            </button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
