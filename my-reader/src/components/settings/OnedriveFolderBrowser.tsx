import { useCallback, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { FolderBrowser } from "@/components/settings/FolderBrowser"
import { api } from "@/lib/tauri-api"
import type { OnedriveFolderEntry } from "@/lib/tauri-specta"

interface OnedriveFolderBrowserProps {
  dataSourceId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (path: string) => void
}

export function OnedriveFolderBrowser({
  dataSourceId,
  open,
  onOpenChange,
  onSelect,
}: OnedriveFolderBrowserProps) {
  const { t } = useTranslation()
  const [currentPath, setCurrentPath] = useState("/")
  const [folders, setFolders] = useState<OnedriveFolderEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchFolders = useCallback(
    async (path: string) => {
      setLoading(true)
      setError(null)
      try {
        const result = await api.onedriveListFolders(dataSourceId, path)
        setFolders(result)
      } catch {
        setError(t("addDataSourceForm.onedriveBrowserError"))
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
      title={t("addDataSourceForm.onedriveBrowserTitle")}
      open={open}
      onOpenChange={onOpenChange}
      currentPath={currentPath}
      folders={folders}
      loading={loading}
      error={error}
      loadingMessage={t("addDataSourceForm.onedriveBrowserLoading")}
      emptyMessage={t("addDataSourceForm.onedriveBrowserEmpty")}
      errorMessage={t("addDataSourceForm.onedriveBrowserError")}
      selectLabel={t("addDataSourceForm.onedriveBrowserSelect")}
      onNavigate={navigateTo}
      onRefresh={() => fetchFolders(currentPath)}
      onSelect={onSelect}
    />
  )
}
