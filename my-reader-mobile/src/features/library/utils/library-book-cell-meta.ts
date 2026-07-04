import type { MenuAction } from "@react-native-menu/menu"

import type { BookItem } from "@/src/domain/types"
import type {
  BookDownloadStatus,
  BookProgressSnapshot,
} from "@/src/features/library/components/books/book-cover"
import { buildBookMenuActions } from "@/src/features/library/utils/book-menu"

type BookFormatMetaLike = {
  effectiveFormat?: string
}

type ProgressByBookId = Record<string, Record<string, number | undefined>>

export type LibraryBookCellMeta = {
  downloadStatus: BookDownloadStatus
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
  bookDownloadStatusById: Record<string, BookDownloadStatus | string>
  bookFormatMetaById: ReadonlyMap<string, BookFormatMetaLike>
  bookFormatsById: Record<string, string[] | undefined>
  favoriteSet: ReadonlySet<string>
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

/**
 * Precomputes per-cell values outside FlashList's `renderItem` hot path.
 * i18n labels, menu action arrays, progress snapshots, and subscription keys
 * otherwise get rebuilt for every recycled cell during a scroll commit.
 */
export function buildLibraryBookCellMetaById({
  bookActiveFormatsById,
  bookDownloadStatusById,
  bookFormatMetaById,
  bookFormatsById,
  favoriteSet,
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
    const readerFormat = bookFormatMetaById.get(book.id)?.effectiveFormat
    const activeFormat =
      readerFormat ??
      (downloadStatus === "downloading"
        ? bookActiveFormatsById.get(book.id)
        : undefined)
    const subscriptionLibraryId =
      isRemote && downloadStatus === "downloading"
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
      menuActions: buildBookMenuActions(downloadStatus, {
        isRemote,
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
      subscriptionFormat: subscriptionLibraryId ? activeFormat : undefined,
      subscriptionLibraryId,
    })
  }

  return next
}
