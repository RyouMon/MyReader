export type ReaderImageBook = {
  title: string
  authors?: readonly string[]
}

const imageExtensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/avif": "avif",
  "image/bmp": "bmp",
  "image/tiff": "tiff",
}

/** Preserve the source format; use catalog metadata, never UI placeholder authors. */
export function readerImageFileName(
  book: ReaderImageBook,
  position: number,
  resourceName: string,
  mimeType?: string,
): string {
  const authors = (book.authors ?? [])
    .map((author) => author.trim())
    .filter(
      (author) =>
        author && !/^(unknown(?: author)?|未知(?:作者)?)$/i.test(author),
    )
  const extension =
    resourceName.match(/\.(jpe?g|png|gif|webp|svg|avif|bmp|tiff?)$/i)?.[1] ??
    imageExtensions[mimeType ?? ""]
  const clean = (value: string) =>
    value.replace(/[\p{Cc}<>:"/\\|?*]/gu, "_").trim()
  const stem = [authors.join("、"), book.title]
    .filter(Boolean)
    .map(clean)
    .join("-")
  const page = Number.isFinite(position) ? Math.max(1, Math.floor(position)) : 1
  return `${stem}-${page}${extension ? `.${extension}` : ""}`
}
