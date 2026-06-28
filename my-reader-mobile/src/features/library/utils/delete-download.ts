import { dismissTasksForPath } from "@/src/domain/download/download-store"
import { evictLocalFileForLibrary } from "@/src/domain/sync/file-actions"
import i18n from "@/src/i18n"
import { showAlertWithStatusBarRestore } from "@/src/constants/alert-with-status-bar"

export type ConfirmDeleteLocalDownloadOptions = {
  /** Called immediately when the user confirms deletion, before async work. */
  onConfirm?: () => void
  /**
   * Called if eviction/dismiss fails. When provided, the caller is responsible
   * for showing error UI (the default alert is suppressed).
   */
  onError?: (error: unknown) => void
}

/**
 * Evicts downloaded file(s) from local cache and clears any finished download
 * tasks tied to the same path(s).
 */
export async function deleteLocalDownload(
  libraryId: string,
  relativePath: string | string[],
): Promise<void> {
  const paths = Array.isArray(relativePath) ? relativePath : [relativePath]
  for (const path of paths) {
    await evictLocalFileForLibrary(libraryId, path)
    dismissTasksForPath(libraryId, path)
  }
}

/**
 * Shows the same confirmation alert used across library surfaces, then deletes
 * the local download(s) on confirm. Callers with no special behavior can omit
 * options; callers that need optimistic UI updates can provide `onConfirm`
 * and/or handle errors via `onError`.
 */
export function confirmDeleteLocalDownload(
  bookTitle: string,
  libraryId: string,
  relativePath: string | string[],
  options?: ConfirmDeleteLocalDownloadOptions,
): void {
  showAlertWithStatusBarRestore(
    i18n.t("sync.deleteDownloadFile"),
    i18n.t("sync.confirmDeleteDownload", { title: bookTitle }),
    [
      { text: i18n.t("common.cancel"), style: "cancel" },
      {
        text: i18n.t("common.delete"),
        style: "destructive",
        onPress: () => {
          options?.onConfirm?.()
          void deleteLocalDownload(libraryId, relativePath).catch((err) => {
            if (options?.onError) {
              options.onError(err)
              return
            }
            showAlertWithStatusBarRestore(
              i18n.t("sync.deleteFailed"),
              err instanceof Error ? err.message : String(err),
            )
          })
        },
      },
    ],
  )
}
