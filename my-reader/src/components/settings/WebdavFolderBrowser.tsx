import { useCallback, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { FolderBrowser } from "@/components/settings/FolderBrowser"
import { api } from "@/lib/tauri-api"
import type { WebdavFolderEntry } from "@/lib/tauri-specta"

interface WebdavFolderBrowserProps {
  dataSourceId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (path: string) => void | Promise<void>
  onCancel?: () => void
  cancelLabel?: string
  selectLabel?: string
  selectingLabel?: string
  closeOnSelect?: boolean
  createSubdirectory?: boolean
  embedded?: boolean
}

export function WebdavFolderBrowser({
  dataSourceId,
  open,
  onOpenChange,
  onSelect,
  onCancel,
  cancelLabel,
  selectLabel,
  selectingLabel,
  closeOnSelect,
  createSubdirectory,
  embedded,
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

  return (
    <FolderBrowser
      title={t("addLibraryForm.webdavBrowserTitle")}
      open={open}
      onOpenChange={onOpenChange}
      currentPath={currentPath}
      folders={folders}
      loading={loading}
      error={error}
      loadingMessage={t("addLibraryForm.webdavBrowserLoading")}
      emptyMessage={t("addLibraryForm.webdavBrowserEmpty")}
      errorMessage={t("addLibraryForm.webdavBrowserError")}
      selectLabel={selectLabel ?? t("addLibraryForm.webdavBrowserSelect")}
      onNavigate={navigateTo}
      onRefresh={() => fetchFolders(currentPath)}
      onSelect={onSelect}
      onCancel={onCancel}
      cancelLabel={cancelLabel}
      selectingLabel={selectingLabel}
      closeOnSelect={closeOnSelect}
      createSubdirectory={createSubdirectory}
      embedded={embedded}
    />
  )
}
