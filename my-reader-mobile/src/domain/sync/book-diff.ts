export interface BookSummary {
  id: string // calibreId
  path?: string
  hasCover: boolean
  formats: string[]
  formatPaths: string[]
}

export interface BookDiff {
  added: BookSummary[]
  removed: BookSummary[]
  unchanged: BookSummary[]
  modified: { old: BookSummary; new: BookSummary }[]
}

/**
 * Diff two book lists by calibreId.
 *
 * - added: books present in newList but not in oldList.
 * - removed: books present in oldList but not in newList.
 * - modified: calibreId matches but path or hasCover changed.
 * - unchanged: everything else.
 */
export function diffBooks(
  oldBooks: BookSummary[],
  newBooks: BookSummary[],
): BookDiff {
  const oldById = new Map(oldBooks.map((b) => [b.id, b]))
  const newById = new Map(newBooks.map((b) => [b.id, b]))

  const added: BookSummary[] = []
  const removed: BookSummary[] = []
  const unchanged: BookSummary[] = []
  const modified: { old: BookSummary; new: BookSummary }[] = []

  for (const newBook of newBooks) {
    const oldBook = oldById.get(newBook.id)
    if (!oldBook) {
      added.push(newBook)
    } else if (
      oldBook.path !== newBook.path ||
      oldBook.hasCover !== newBook.hasCover
    ) {
      modified.push({ old: oldBook, new: newBook })
    } else {
      unchanged.push(newBook)
    }
  }

  for (const oldBook of oldBooks) {
    if (!newById.has(oldBook.id)) {
      removed.push(oldBook)
    }
  }

  return { added, removed, unchanged, modified }
}
