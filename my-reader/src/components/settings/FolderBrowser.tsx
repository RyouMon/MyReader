import { appendRemotePathSegment } from "@my-reader/tools/remote-path"
import {
  ArrowUp,
  ChevronRight,
  Folder,
  Loader2,
  MoreHorizontal,
  RefreshCw,
} from "lucide-react"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { StatusNotice } from "@/components/common/StatusNotice"

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
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
  onSelect: (path: string) => void | Promise<void>
  onCancel?: () => void
  cancelLabel?: string
  selectingLabel?: string
  closeOnSelect?: boolean
  createSubdirectory?: boolean
  embedded?: boolean
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
  onCancel,
  cancelLabel,
  selectingLabel,
  closeOnSelect = true,
  createSubdirectory = false,
  embedded = false,
}: FolderBrowserProps) {
  const { t } = useTranslation()
  const [newDirectoryName, setNewDirectoryName] = useState("")
  const [selecting, setSelecting] = useState(false)
  const [selectError, setSelectError] = useState<string | null>(null)

  const pathParts =
    currentPath === "/" ? [] : currentPath.split("/").filter(Boolean)
  const canGoBack = currentPath !== "/"

  const ITEMS_TO_DISPLAY = 3
  const shouldCollapse = pathParts.length + 1 > ITEMS_TO_DISPLAY
  const tailCount = ITEMS_TO_DISPLAY - 1
  const tailSegments = shouldCollapse ? pathParts.slice(-tailCount) : pathParts
  const hiddenSegments = shouldCollapse ? pathParts.slice(0, -tailCount) : []
  const trimmedDirectoryName = newDirectoryName.trim()
  const selectedPath = trimmedDirectoryName
    ? appendRemotePathSegment(currentPath, trimmedDirectoryName)
    : currentPath
  const newDirectoryNameInvalid =
    trimmedDirectoryName.length > 0 && selectedPath === null
  const folderListClassName = cn(
    "overflow-y-auto rounded-xl border border-border bg-bg-secondary p-1.5",
    embedded ? "min-h-0 flex-1" : "min-h-[220px] max-h-[320px]",
  )
  const folderListStateClassName = cn(
    folderListClassName,
    !embedded && "h-[220px]",
  )

  useEffect(() => {
    if (open) {
      setNewDirectoryName("")
      setSelectError(null)
    }
  }, [open])

  function resetSelection() {
    setNewDirectoryName("")
    setSelectError(null)
  }

  function navigateTo(path: string) {
    resetSelection()
    onNavigate(path)
  }

  function handleBreadcrumbClick(index: number) {
    if (currentPath === "/") return
    if (index < 0 || index >= pathParts.length) return
    navigateTo(`/${pathParts.slice(0, index + 1).join("/")}/`)
  }

  function handleGoBack() {
    if (!canGoBack) return
    if (pathParts.length <= 1) {
      navigateTo("/")
    } else {
      navigateTo(`/${pathParts.slice(0, -1).join("/")}/`)
    }
  }

  async function handleConfirm() {
    if (!selectedPath) return
    setSelecting(true)
    setSelectError(null)
    try {
      await onSelect(selectedPath)
      if (closeOnSelect) onOpenChange(false)
    } catch (error) {
      setSelectError(error instanceof Error ? error.message : String(error))
    } finally {
      setSelecting(false)
    }
  }

  const content = (
    <>
      {!embedded ? (
        <DialogHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <DialogTitle className="text-base font-semibold text-ink-1">
                {title}
              </DialogTitle>
              {subtitle && (
                <DialogDescription className="text-[13px] text-ink-2">
                  {subtitle}
                </DialogDescription>
              )}
            </div>
          </div>
        </DialogHeader>
      ) : null}

      {/* Toolbar */}
      <div className="flex items-center gap-2 mb-3">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={!canGoBack || loading}
          onClick={handleGoBack}
          aria-label={t("addLibraryForm.folderBrowserUp")}
          title={t("addLibraryForm.folderBrowserUp")}
        >
          <ArrowUp />
        </Button>

        <Breadcrumb
          aria-label="Breadcrumb"
          className="flex-1 min-w-0 text-[13px] font-medium overflow-hidden"
        >
          <BreadcrumbList className="flex-nowrap overflow-hidden">
            <BreadcrumbItem>
              {pathParts.length === 0 ? (
                <BreadcrumbPage dir="ltr" className="text-ink-1">
                  /
                </BreadcrumbPage>
              ) : (
                <BreadcrumbLink
                  asChild
                  dir="ltr"
                  className="inline-flex shrink-0 items-center text-ink-2 transition-colors hover:text-primary"
                >
                  <button type="button" onClick={() => navigateTo("/")}>
                    /
                  </button>
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
                  <BreadcrumbItem
                    key={actualIndex}
                    className="min-w-0 overflow-hidden"
                  >
                    {isLast ? (
                      <BreadcrumbPage dir="ltr" className="truncate text-ink-1">
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
                  {!isLast && (
                    <BreadcrumbSeparator key={`sep-${actualIndex}`} />
                  )}
                </>
              )
            })}
          </BreadcrumbList>
        </Breadcrumb>

        {onRefresh && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={loading}
            onClick={onRefresh}
            aria-label={t("common.refresh")}
            title={t("common.refresh")}
          >
            <RefreshCw className={cn(loading && "animate-spin")} />
          </Button>
        )}
      </div>

      {/* Folder list */}
      {loading ? (
        <div
          className={cn(
            folderListStateClassName,
            "flex flex-col items-center justify-center gap-2 text-sm text-ink-2",
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
            folderListStateClassName,
            "flex flex-col items-center justify-center gap-2 px-4 text-center text-sm text-danger",
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
            folderListStateClassName,
            "flex flex-col items-center justify-center gap-2 text-sm text-ink-2",
          )}
        >
          <Folder className="size-8 opacity-40" />
          <span>{emptyMessage}</span>
        </div>
      ) : (
        <ul className={folderListClassName} aria-label={title}>
          {folders.map((folder, index) => (
            <li key={folder.path} className="list-none">
              <button
                type="button"
                onClick={() => navigateTo(folder.path)}
                style={{ animationDelay: `${index * 20}ms` }}
                className={cn(
                  "folder-browser-row flex items-center gap-3 w-full h-11 px-3 rounded-md text-left",
                  "text-sm text-ink-1 bg-transparent",
                  "hover:bg-accent hover:text-accent-foreground",
                  "active:scale-[0.995] transition-all",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
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

      {createSubdirectory && (
        <div className="mt-3 space-y-1.5 rounded-md border border-border bg-bg-secondary p-3">
          <label
            htmlFor="remote-library-folder-name"
            className="text-sm font-medium text-ink-1"
          >
            {t("addLibraryForm.newRemoteFolder")}
          </label>
          <Input
            id="remote-library-folder-name"
            data-testid="remote-library-folder-name"
            value={newDirectoryName}
            onChange={(event) => setNewDirectoryName(event.target.value)}
            placeholder={t("library.defaultMyreaderName")}
            className="h-9"
            autoComplete="off"
            spellCheck={false}
          />
          <p
            className={cn(
              "text-xs",
              newDirectoryNameInvalid ? "text-danger" : "text-ink-2",
            )}
          >
            {newDirectoryNameInvalid
              ? t("addLibraryForm.newRemoteFolderInvalid")
              : t("addLibraryForm.newRemoteFolderDetail")}
          </p>
        </div>
      )}

      {selectError ? (
        <StatusNotice tone="error" className="mt-3">
          {selectError}
        </StatusNotice>
      ) : null}

      <DialogFooter className="mt-4 shrink-0 flex-col-reverse gap-3 border-t border-border pt-3 sm:flex-row sm:items-start sm:justify-between">
        <span className="flex-1 min-w-0 text-[13px] text-ink-2 whitespace-normal break-words">
          {t("addLibraryForm.selectedPath", {
            path: selectedPath ?? currentPath,
          })}
        </span>
        <div className="flex gap-2 shrink-0">
          {!embedded ? (
            <button
              type="button"
              disabled={selecting}
              onClick={onCancel ?? (() => onOpenChange(false))}
              className={cn(
                "inline-flex items-center justify-center h-9 px-4 rounded-md text-sm font-medium",
                "border border-border bg-transparent text-ink-1",
                "hover:bg-accent hover:text-accent-foreground transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                "disabled:pointer-events-none disabled:opacity-50",
              )}
            >
              {cancelLabel ?? t("common.cancel")}
            </button>
          ) : null}
          <button
            type="button"
            disabled={loading || selecting || newDirectoryNameInvalid}
            onClick={() => void handleConfirm()}
            className={cn(
              "inline-flex items-center justify-center gap-2 h-9 px-4 rounded-md text-sm font-medium",
              "bg-primary text-primary-foreground",
              "hover:brightness-105 transition-all",
              "active:scale-[0.98]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              "disabled:opacity-50 disabled:pointer-events-none",
            )}
          >
            {selecting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {selectingLabel ?? selectLabel}
              </>
            ) : (
              selectLabel
            )}
          </button>
        </div>
      </DialogFooter>
    </>
  )

  if (embedded) {
    return <div className="flex h-full min-h-0 flex-col">{content}</div>
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && selecting) return
        onOpenChange(nextOpen)
      }}
    >
      <DialogContent
        className="w-full max-w-[calc(100vw-2rem)] sm:max-w-[480px] grid-cols-1 p-5 gap-0 border-border bg-bg-secondary"
        showCloseButton={!selecting}
      >
        {content}
      </DialogContent>
    </Dialog>
  )
}
