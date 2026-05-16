import { Folder, Loader2 } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
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
import { api } from "@/lib/tauri-api"
import type { WebdavFolderEntry } from "@/lib/tauri-specta"
import { cn } from "@/lib/utils"

interface WebdavFolderBrowserProps {
  dataSourceId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (path: string) => void
}

export function WebdavFolderBrowser({
  dataSourceId,
  open,
  onOpenChange,
  onSelect,
}: WebdavFolderBrowserProps) {
  const { t } = useTranslation()
  const [currentPath, setCurrentPath] = useState("/")
  const [folders, setFolders] = useState<WebdavFolderEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchFolders = useCallback(
    async (path: string) => {
      setLoading(true)
      setError(null)
      try {
        const result = await api.webdavListFolders(dataSourceId, path)
        setFolders(result)
      } catch {
        setError(t("addLibraryForm.webdavBrowserError"))
        setFolders([])
      } finally {
        setLoading(false)
      }
    },
    [dataSourceId, t],
  )

  useEffect(() => {
    if (open) {
      setCurrentPath("/")
      fetchFolders("/")
    }
  }, [open, fetchFolders])

  function navigateTo(path: string) {
    setCurrentPath(path)
    fetchFolders(path)
  }

  function handleBreadcrumbClick(index: number) {
    if (currentPath === "/") return
    const parts = currentPath.split("/").filter(Boolean)
    if (index >= parts.length) return
    if (index === 0) {
      navigateTo("/")
    } else {
      navigateTo(`${parts.slice(0, index + 1).join("/")}/`)
    }
  }

  function handleConfirm() {
    onSelect(currentPath)
    onOpenChange(false)
  }

  const pathParts = currentPath === "/" ? [] : currentPath.split("/").filter(Boolean)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("addLibraryForm.webdavBrowserTitle")}</DialogTitle>
          <DialogDescription>
            {currentPath === "/" ? "/" : currentPath}
          </DialogDescription>
        </DialogHeader>

        {/* Breadcrumb */}
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              {pathParts.length === 0 ? (
                <BreadcrumbPage>/</BreadcrumbPage>
              ) : (
                <BreadcrumbLink onClick={() => navigateTo("/")}>/</BreadcrumbLink>
              )}
            </BreadcrumbItem>
            {pathParts.map((part, i) => (
              <span key={i} className="contents">
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  {i === pathParts.length - 1 ? (
                    <BreadcrumbPage>{part}</BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink onClick={() => handleBreadcrumbClick(i + 1)}>
                      {part}
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
              </span>
            ))}
          </BreadcrumbList>
        </Breadcrumb>

        {/* Folder list */}
        <div className="min-h-[200px] max-h-[300px] overflow-y-auto rounded-md border">
          {loading ? (
            <div className="flex items-center justify-center h-[200px] text-muted-foreground">
              <Loader2 className="size-4 animate-spin mr-2" />
              {t("addLibraryForm.webdavBrowserLoading")}
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-[200px] text-sm text-destructive">
              {error}
            </div>
          ) : folders.length === 0 ? (
            <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">
              {t("addLibraryForm.webdavBrowserEmpty")}
            </div>
          ) : (
            <div className="divide-y">
              {folders.map((folder) => (
                <button
                  key={folder.path}
                  type="button"
                  className={cn(
                    "flex items-center gap-2.5 w-full px-3 py-2 text-sm text-left",
                    "hover:bg-muted/50 transition-colors",
                  )}
                  onClick={() => navigateTo(folder.path)}
                >
                  <Folder className="size-4 text-muted-foreground shrink-0" />
                  <span className="truncate">{folder.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <button
            type="button"
            className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:pointer-events-none"
            onClick={handleConfirm}
            disabled={loading}
          >
            {t("addLibraryForm.webdavBrowserSelect")}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
