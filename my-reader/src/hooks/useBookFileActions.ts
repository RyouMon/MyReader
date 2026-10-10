import { useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { api } from "@/lib/tauri-api"
import { errorMessage } from "@/lib/error-presentation"
import { useBookFileState } from "./queries/useBookFileState"

export function useBookFileActions(
  libraryId: string | null,
  bookId: number,
  format: string,
) {
  const { t } = useTranslation()
  const [pending, setPending] = useState(false)
  const fmt = format.toUpperCase()
  const fileState = useBookFileState(libraryId, bookId, fmt)
  const available =
    fileState.data?.localState === "present" ||
    fileState.data?.localState === "local_only" ||
    fileState.data?.localState === "dirty_push"
  const disabled = !libraryId || !available || pending

  async function runAction(action: "copy" | "reveal" | "save") {
    if (disabled || !libraryId) return
    setPending(true)
    try {
      if (action === "copy") {
        await api.copyBookFilePath(libraryId, bookId, fmt)
        toast.success(t("bookShare.pathCopied"))
      } else if (action === "reveal") {
        await api.revealBookFile(libraryId, bookId, fmt)
      } else if (await api.saveBookFileAs(libraryId, bookId, fmt)) {
        toast.success(t("bookShare.fileSaved"))
      }
    } catch (error) {
      toast.error(t(`bookShare.${action}Failed`), {
        description: errorMessage(error),
      })
      void fileState.refetch()
    } finally {
      setPending(false)
    }
  }

  return {
    disabled,
    unavailable: !fileState.isLoading && !available,
    copyPath: () => runAction("copy"),
    revealFile: () => runAction("reveal"),
    saveAs: () => runAction("save"),
  }
}
