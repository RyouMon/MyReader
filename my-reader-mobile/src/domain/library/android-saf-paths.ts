import {
  canonicalRelativePathSegments,
  joinRelativePath,
} from "@/src/services/fs/path"

const MANAGED_BOOK_DIRECTORY =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

export function managedBookRelativePaths(
  books: { path?: string | null; formats?: string[] }[],
): string[] {
  return books.flatMap((book) =>
    (book.formats ?? []).map((format) =>
      joinRelativePath(book.path, `book.${format.toLowerCase()}`),
    ),
  )
}

export function isManagedBookDirectoryName(name: string): boolean {
  return MANAGED_BOOK_DIRECTORY.test(name)
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
