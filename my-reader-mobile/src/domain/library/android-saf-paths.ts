import {
  canonicalRelativePath,
  canonicalRelativePathSegments,
  joinRelativePath,
} from "@/src/services/fs/path"

const LEGACY_MANAGED_BOOK_DIRECTORY =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const READABLE_MANAGED_BOOK_DIRECTORY = /^.+ \([0-9a-f]{6}\)$/

export function managedBookRelativePaths(
  books: { formatPaths?: string[] }[],
): string[] {
  return books.flatMap((book) =>
    (book.formatPaths ?? []).map(canonicalRelativePath),
  )
}

export function managedBookCoverRelativePaths(
  books: { path?: string | null; hasCover?: boolean }[],
): string[] {
  return books.flatMap((book) =>
    book.hasCover && book.path
      ? [joinRelativePath(book.path, "cover.jpg")]
      : [],
  )
}

export function isManagedBookDirectoryName(name: string): boolean {
  return (
    LEGACY_MANAGED_BOOK_DIRECTORY.test(name) ||
    READABLE_MANAGED_BOOK_DIRECTORY.test(name)
  )
}

export function managedBookDirectory(relativePath: string): string | null {
  const segments = canonicalRelativePathSegments(relativePath)
  if (
    segments.length !== 3 ||
    segments[0] !== "Books" ||
    !isManagedBookDirectoryName(segments[1] ?? "")
  ) {
    return null
  }
  return `Books/${segments[1]}`
}
