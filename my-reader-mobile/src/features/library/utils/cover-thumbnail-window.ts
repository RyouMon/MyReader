import type { BookItem } from "@/src/domain/types"

export type CoverThumbnailViewItem = {
  item: BookItem
  index: number | null
  isViewable?: boolean
}

export type ResolveCoverThumbnailBookIdsInput = {
  visibleBooks: BookItem[]
  viewableItems: CoverThumbnailViewItem[]
  lookaroundItemCount: number
}

export type ResolveInitialCoverThumbnailBookIdsInput = {
  visibleBooks: BookItem[]
  itemCount: number
}

function addCoverBookId(bookIds: Set<string>, book?: BookItem): void {
  if (book?.coverUri) {
    bookIds.add(book.id)
  }
}

export function resolveCoverThumbnailBookIds({
  visibleBooks,
  viewableItems,
  lookaroundItemCount,
}: ResolveCoverThumbnailBookIdsInput): Set<string> {
  const bookIds = new Set<string>()

  for (const viewItem of viewableItems) {
    if (viewItem.isViewable === false) continue

    if (viewItem.index === null) {
      addCoverBookId(bookIds, viewItem.item)
      continue
    }

    const firstIndex = Math.max(0, viewItem.index - lookaroundItemCount)
    const lastIndex = Math.min(
      visibleBooks.length - 1,
      viewItem.index + lookaroundItemCount,
    )

    for (let index = firstIndex; index <= lastIndex; index += 1) {
      addCoverBookId(bookIds, visibleBooks[index])
    }
  }

  return bookIds
}

export function resolveInitialCoverThumbnailBookIds({
  visibleBooks,
  itemCount,
}: ResolveInitialCoverThumbnailBookIdsInput): Set<string> {
  const bookIds = new Set<string>()
  const safeItemCount = Math.max(0, Math.min(visibleBooks.length, itemCount))

  for (let index = 0; index < safeItemCount; index += 1) {
    addCoverBookId(bookIds, visibleBooks[index])
  }

  return bookIds
}
