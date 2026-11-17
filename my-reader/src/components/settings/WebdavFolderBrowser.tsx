import { useTranslation } from "react-i18next"

import { FolderBrowser } from "@/components/settings/FolderBrowser"
import { api } from "@/lib/tauri-api"
import { useRemoteFolderBrowser } from "@/hooks/useRemoteFolderBrowser"

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
  const {
    currentPath,
    folders,
    loading,
    error,
    navigateTo,
    refresh,
    createFolder,
  } = useRemoteFolderBrowser(dataSourceId, open, api.webdavListFolders)

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
      onRefresh={refresh}
      onSelect={onSelect}
      onCancel={onCancel}
      cancelLabel={cancelLabel}
      selectingLabel={selectingLabel}
      closeOnSelect={closeOnSelect}
      onCreateDirectory={createSubdirectory ? createFolder : undefined}
      embedded={embedded}
    />
  )
}
