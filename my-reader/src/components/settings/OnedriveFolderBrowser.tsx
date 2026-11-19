import { useTranslation } from "react-i18next"

import { FolderBrowser } from "@/components/settings/FolderBrowser"
import { api } from "@/lib/tauri-api"
import { useRemoteFolderBrowser } from "@/hooks/useRemoteFolderBrowser"

interface OnedriveFolderBrowserProps {
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

export function OnedriveFolderBrowser({
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
}: OnedriveFolderBrowserProps) {
  const { t } = useTranslation()
  const {
    currentPath,
    folders,
    loading,
    error,
    navigateTo,
    refresh,
    createFolder,
  } = useRemoteFolderBrowser(dataSourceId, open, api.onedriveListFolders)

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
      selectLabel={selectLabel ?? t("addDataSourceForm.onedriveBrowserSelect")}
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
