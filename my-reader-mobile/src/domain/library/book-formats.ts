const readableFormatSet = new Set(["EPUB", "PDF", "CBZ"])

export function getReadableFormats(formats?: string[]): string[] {
  return (formats ?? [])
    .map((format) => format.toUpperCase())
    .filter((format) => readableFormatSet.has(format))
    .sort((left, right) => left.localeCompare(right, "en"))
}

export function getFormatFromPath(path: string): string | undefined {
  const match = path.match(/\.([A-Za-z0-9]+)$/)
  return match?.[1]?.toUpperCase()
}

export function resolveEffectiveFormat(
  readableFormats: string[],
  selectedFormat?: string,
): string | undefined {
  const normalizedSelected = selectedFormat?.toUpperCase()
  if (normalizedSelected && readableFormats.includes(normalizedSelected)) {
    return normalizedSelected
  }
  return readableFormats[0]
}

export function pathBelongsToBook(
  relativePath: string,
  bookPath?: string,
): boolean {
  if (!bookPath) return false
  const normalizedBookPath = bookPath.replace(/^\/+/, "").replace(/\/+$/, "")
  return (
    relativePath === normalizedBookPath ||
    relativePath.startsWith(`${normalizedBookPath}/`)
  )
}
