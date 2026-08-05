import type { MenuAction } from "@react-native-menu/menu"

import i18n from "@/src/i18n"

import type { BookDownloadStatus } from "@/src/features/library/components/books/book-cover"

import { resolveEffectiveFormat } from "@/src/domain/library/book-formats"

export type BookMenuConfig = {
  isManaged?: boolean
  isRemote: boolean
  canUpload?: boolean
  canDeleteDownload?: boolean
  isFavorite?: boolean
  formats?: string[]
  selectedFormat?: string
}

/**
 * Builds the per-book menu actions from primitive inputs so cells can recompute
 * only when their own inputs change.
 */
export function buildBookMenuActions(
  downloadStatus: BookDownloadStatus | undefined,
  menuConfig: BookMenuConfig,
): MenuAction[] {
  const {
    isManaged,
    isRemote,
    canUpload,
    canDeleteDownload,
    isFavorite,
    formats,
    selectedFormat,
  } = menuConfig
  const readableFormats = formats ?? []
  const effectiveFormat = resolveEffectiveFormat(
    readableFormats,
    selectedFormat,
  )
  const actions: MenuAction[] = [
    { id: "detail", title: i18n.t("bookMenu.detail") },
  ]
  actions.push({
    id: "favorite",
    title: isFavorite
      ? i18n.t("bookMenu.removeFromFavorites")
      : i18n.t("bookMenu.addToFavorites"),
  })

  if (readableFormats.length === 1) {
    actions.push({
      id: `share:${readableFormats[0]}`,
      title: i18n.t("bookMenu.share"),
    })
  } else if (readableFormats.length > 1) {
    actions.push({
      id: "share",
      title: i18n.t("bookMenu.share"),
      subactions: readableFormats.map((fmt) => ({
        id: `share:${fmt}`,
        title: fmt,
      })),
    })
  } else {
    actions.push({
      id: "share",
      title: i18n.t("bookMenu.share"),
    })
  }

  if (isRemote) {
    if (downloadStatus === "downloading") {
      actions.push({
        id: "cancelDownload",
        title: i18n.t("bookMenu.cancelDownload"),
        attributes: { destructive: true },
      })
    } else if (downloadStatus !== "downloaded") {
      if (readableFormats.length === 1) {
        actions.push({
          id: `download:${readableFormats[0]}`,
          title: i18n.t("bookMenu.downloadFormat", {
            format: readableFormats[0],
          }),
        })
      } else if (readableFormats.length > 1) {
        actions.push({
          id: "download",
          title: i18n.t("bookMenu.download"),
          subactions: readableFormats.map((fmt) => ({
            id: `download:${fmt}`,
            title: fmt,
          })),
        })
      }
    }
  }

  if (readableFormats.length > 1) {
    actions.push({
      id: "setDefaultFormat",
      title: i18n.t("bookMenu.defaultFormat", { format: effectiveFormat }),
      subactions: readableFormats.map((fmt) => ({
        id: `setDefaultFormat:${fmt}`,
        title: `${effectiveFormat === fmt ? "✓ " : ""}${fmt}`,
      })),
    })
  }

  if (isManaged && isRemote && canUpload) {
    actions.push({ id: "uploadFile", title: i18n.t("bookMenu.uploadFile") })
  }

  const removalActions: MenuAction[] = []
  if (isRemote && downloadStatus === "downloaded") {
    removalActions.push({
      id: "deleteDownload",
      title: i18n.t("bookMenu.deleteDownload"),
      attributes: { destructive: true, disabled: !canDeleteDownload },
    })
  }

  if (isManaged) {
    actions.push({
      id: "editMetadata",
      title: i18n.t("bookMenu.editMetadata"),
    })
    removalActions.push({
      id: "deleteBook",
      title: i18n.t("bookMenu.deleteBook"),
      attributes: { destructive: true },
    })
  }

  if (removalActions.length > 0) {
    actions.push({
      id: "bookRemovalActions",
      title: "",
      displayInline: true,
      subactions: removalActions,
    })
  }

  return actions
}
