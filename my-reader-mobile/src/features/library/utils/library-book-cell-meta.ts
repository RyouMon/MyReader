import type { MenuAction } from "@react-native-menu/menu"

import type { BookItem } from "@/src/domain/types"
import type {
  BookDownloadStatus,
  BookProgressSnapshot,
  BookTransferStatus,
} from "@/src/features/library/components/books/book-cover"
import { buildBookMenuActions } from "@/src/features/library/utils/book-menu"

type BookFormatMetaLike = {
  effectiveFormat?: string
}

type ProgressByBookId = Record<string, Record<string, number | undefined>>

export type LibraryBookCellMeta = {
  downloadStatus: BookDownloadStatus
  transferStatus: BookTransferStatus
  menuActions: MenuAction[]
  moreActionsLabel: string
  openBookLabel: string
  progress?: BookProgressSnapshot
  readerFormat?: string
  subscriptionFormat?: string
  subscriptionLibraryId?: string
}

export type LibraryBookCellMetaTranslate = (
  key: string,
  options?: { title: string },
) => string

type BuildLibraryBookCellMetaByIdInput = {
  bookActiveFormatsById: ReadonlyMap<string, string>
  bookCanUploadById?: Record<string, boolean>
  bookCanDeleteDownloadById?: Record<string, boolean>
  bookDownloadStatusById: Record<string, BookDownloadStatus | string>
  bookTransferStatusById?: Record<string, BookTransferStatus | string>
  bookFormatMetaById: ReadonlyMap<string, BookFormatMetaLike>
  bookFormatsById: Record<string, string[] | undefined>
  favoriteSet: ReadonlySet<string>
  isManaged?: boolean
  isRemote: boolean
  progressByBookId?: ProgressByBookId
  selectedFormatById: Record<string, string | undefined>
  selectedLibraryId?: string
  translate: LibraryBookCellMetaTranslate
  visibleBooks: BookItem[]
}

function normalizeDownloadStatus(
  status: BookDownloadStatus | string | undefined,
): BookDownloadStatus {
  if (
    status === "downloaded" ||
    status === "downloading" ||
    status === "notDownloaded"
  ) {
    return status
  }
  return "notDownloaded"
}

function normalizeTransferStatus(
  status: BookTransferStatus | string | undefined,
  downloadStatus: BookDownloadStatus,
): BookTransferStatus {
  if (status === "uploadPending" || status === "uploading") return status
  return normalizeDownloadStatus(status ?? downloadStatus)
}

/**
 * Precomputes per-cell values outside FlashList's `renderItem` hot path.
 * i18n labels, menu action arrays, progress snapshots, and subscription keys
 * otherwise get rebuilt for every recycled cell during a scroll commit.
 */
export function buildLibraryBookCellMetaById({
  bookActiveFormatsById,
  bookCanUploadById,
  bookCanDeleteDownloadById,
  bookDownloadStatusById,
  bookTransferStatusById,
  bookFormatMetaById,
  bookFormatsById,
  favoriteSet,
  isManaged,
  isRemote,
  progressByBookId,
  selectedFormatById,
  selectedLibraryId,
  translate,
  visibleBooks,
}: BuildLibraryBookCellMetaByIdInput) {
  const next = new Map<string, LibraryBookCellMeta>()

  for (const book of visibleBooks) {
    const downloadStatus = normalizeDownloadStatus(
      bookDownloadStatusById[book.id],
    )
    const transferStatus = normalizeTransferStatus(
      bookTransferStatusById?.[book.id],
      downloadStatus,
    )
    const readerFormat = bookFormatMetaById.get(book.id)?.effectiveFormat
    const activeFormat =
      readerFormat ??
      (downloadStatus === "downloading"
        ? bookActiveFormatsById.get(book.id)
        : undefined)
    const subscriptionLibraryId =
      isRemote &&
      (downloadStatus === "downloading" || transferStatus === "uploading")
        ? selectedLibraryId
        : undefined
    const progressPercent = readerFormat
      ? progressByBookId?.[book.id]?.[readerFormat]
      : undefined
    const progress =
      typeof progressPercent === "number"
        ? { percent: progressPercent }
        : undefined
    const isFavorite = favoriteSet.has(book.id)
    const menuFormats = bookFormatsById[book.id]
    const menuSelectedFormat = selectedFormatById[book.id]

    next.set(book.id, {
      downloadStatus,
      transferStatus,
      menuActions: buildBookMenuActions(downloadStatus, {
        isManaged,
        isRemote,
        canUpload: bookCanUploadById?.[book.id],
        canDeleteDownload: bookCanDeleteDownloadById?.[book.id],
        isFavorite,
        formats: menuFormats,
        selectedFormat: menuSelectedFormat,
      }),
      moreActionsLabel: translate("bookDetail.moreActions", {
        title: book.title,
      }),
      openBookLabel: translate("bookDetail.openBook", { title: book.title }),
      progress,
      readerFormat,
      subscriptionFormat:
        subscriptionLibraryId && downloadStatus === "downloading"
          ? activeFormat
          : undefined,
      subscriptionLibraryId,
    })
  }

  return next
}
