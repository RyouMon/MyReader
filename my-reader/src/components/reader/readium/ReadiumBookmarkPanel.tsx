import { FolderBookmark } from "lucide-react"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import {
  ReaderSidePanelFrame,
  ReaderSidePanelHeader,
} from "@/components/reader/shared/ReaderSidePanelChrome"
import {
  ReadiumBookmarkList,
  type ReadiumBookmarkRow,
} from "./ReadiumBookmarkList"

type ReadiumBookmarkPanelProps = {
  visible: boolean
  bookmarks: ReadiumBookmarkRow[]
  activeBookmarkLocatorKey?: string | null
  loading?: boolean
  mutating?: boolean
  error?: string | null
  onRetry?: () => void
  onSelect?: (row: ReadiumBookmarkRow) => void
  onDelete?: (row: ReadiumBookmarkRow) => void | Promise<void>
  onClose?: () => void
}

export function ReadiumBookmarkPanel({
  visible,
  bookmarks,
  activeBookmarkLocatorKey,
  loading,
  mutating,
  error,
  onRetry,
  onSelect,
  onDelete,
  onClose,
}: ReadiumBookmarkPanelProps) {
  const { t } = useTranslation()
  const [resetKey, setResetKey] = useState(0)

  useEffect(() => {
    if (visible) return
    setResetKey((current) => current + 1)
  }, [visible])

  return (
    <ReaderSidePanelFrame visible={visible} side="left">
      <ReaderSidePanelHeader
        title={t("reader.bookmarks")}
        icon={FolderBookmark}
        onClose={onClose}
      />
      <ReadiumBookmarkList
        key={resetKey}
        bookmarks={bookmarks}
        activeBookmarkLocatorKey={activeBookmarkLocatorKey}
        loading={loading}
        mutating={mutating}
        error={error}
        onRetry={onRetry}
        onSelect={onSelect}
        onDelete={onDelete}
      />
    </ReaderSidePanelFrame>
  )
}
