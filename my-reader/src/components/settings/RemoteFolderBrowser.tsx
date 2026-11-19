import type { DataSourceType } from "@my-reader/tools/types/data-source"
import { useTranslation } from "react-i18next"
import { FolderBrowser } from "@/components/settings/FolderBrowser"
import { api } from "@/lib/tauri-api"
import { useRemoteFolderBrowser } from "@/hooks/useRemoteFolderBrowser"

interface RemoteFolderBrowserProps {
  dataSourceId: string
  sourceType: Exclude<DataSourceType, "local">
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

export function RemoteFolderBrowser({
  dataSourceId,
  sourceType,
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
}: RemoteFolderBrowserProps) {
  const { t } = useTranslation()
  const {
    currentPath,
    folders,
    loading,
    error,
    navigateTo,
    refresh,
    createFolder,
  } = useRemoteFolderBrowser(dataSourceId, open, api.remoteListFolders)

  const title =
    sourceType === "gdrive"
      ? t("addDataSourceForm.typeGdrive")
      : sourceType === "dropbox"
        ? t("addDataSourceForm.typeDropbox")
        : sourceType === "s3"
          ? t("addDataSourceForm.typeS3")
          : t("addLibraryForm.webdavBrowserTitle")

  return (
    <FolderBrowser
      title={title}
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
