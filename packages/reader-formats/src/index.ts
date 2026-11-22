/** Original extensions are also Calibre format keys and reading-state identities. */
export const bookExtensions = [
  "epub",
  "cbz",
  "pdf",
  "kepub.epub",
  "kepub",
  "fb2.zip",
  "fb2",
  "fbz",
  "mobi",
  "azw3",
  "kf8",
  "azw",
  "prc",
  "txt",
  "md",
  "markdown",
  "txtz",
  "html",
  "htm",
  "xhtml",
  "htmlz",
] as const

export function isEpubContainer(format: string) {
  return ["EPUB", "KEPUB", "KEPUB.EPUB"].includes(format.toUpperCase())
}

export function isTextPublication(format: string | null | undefined): boolean {
  const extension = format?.toLowerCase()
  return bookExtensions.some(
    (value) => value === extension && value !== "pdf" && value !== "cbz",
  )
}
