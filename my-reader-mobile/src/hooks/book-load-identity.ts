export type ReadyBookLoadIdentity = {
  status: string
  libraryId?: string
  bookId?: number
  format?: string
}

export function bookLoadRequestKey(
  libraryId: string | null,
  id: string | undefined,
  format: string | undefined,
): string {
  return JSON.stringify([
    libraryId ?? "",
    id ?? "",
    format?.toUpperCase() ?? "",
  ])
}

export function isReadyBookLoadForRequest(
  loadState: ReadyBookLoadIdentity,
  libraryId: string | null,
  id: string | undefined,
  format: string | undefined,
): boolean {
  if (loadState.status !== "ready" || loadState.libraryId !== libraryId) {
    return false
  }

  const bookId = Number(id)
  if (!Number.isFinite(bookId) || loadState.bookId !== bookId) return false

  const requestedFormat = format?.trim()
  return (
    !requestedFormat ||
    loadState.format?.toUpperCase() === requestedFormat.toUpperCase()
  )
}
