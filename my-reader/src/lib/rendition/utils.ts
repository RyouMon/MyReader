/**
 * 将 EPUB 内联样式里针对 `html` / `body` 的选择器改写为挂在章节容器上的类，
 * 避免在 SPA 中命中整页 `<html>` / `<body>` 导致各屏继承与字重不一致。
 */
export function scopeEpubCss(css: string): string {
  if (!css.trim()) return css
  return css
    .replace(/\bhtml\b/g, ".reader-epub-scope")
    .replace(/\bbody\b/g, ".reader-epub-scope")
} /**
 * Prefer `requested` when it matches a file on the book and is readable;
 * otherwise fall back to priority order.
 */

export function resolveReadFormat(
  formats: string[],
  requested: string | undefined,
): string | null {
  if (requested) {
    const u = requested.toUpperCase()
    if (formats.some((f) => f.toUpperCase() === u)) {
      if (pickReadableFormat([u]) === u) return u
    }
  }
  return pickReadableFormat(formats)
} /** Whether a single format string is supported by the in-app reader. */

export function isReadableInAppFormat(format: string): boolean {
  return pickReadableFormat([format]) !== null
}

/** 应用内可阅读的格式：EPUB、CBZ（漫画）、PDF。 */
const FORMAT_PRIORITY = ["EPUB", "CBZ", "PDF"]

/** Pick the best readable format from the available list. */
export function pickReadableFormat(formats: string[]): string | null {
  const upper = formats.map((f) => f.toUpperCase())
  for (const pref of FORMAT_PRIORITY) {
    if (upper.includes(pref)) return pref
  }
  return null
}

const IS_WINDOWS = navigator.userAgent.includes("Windows")

/** Build a URL for the `bookfile` custom protocol. */
export function buildBookFileUrl(
  libraryId: string,
  bookId: number | string,
  format: string,
): string {
  const path = `${libraryId}/${bookId}/${format.toUpperCase()}`
  return IS_WINDOWS
    ? `http://bookfile.localhost/${path}`
    : `bookfile://localhost/${path}`
}
