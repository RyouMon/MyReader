/**
 * Windows WebView2 converts custom URI schemes to `http://{scheme}.localhost/`.
 * macOS/Linux WebKit keeps `{scheme}://localhost/`.
 * Detect once at module load.
 */
const IS_WINDOWS = navigator.userAgent.includes("Windows")

/**
 * Monotonically increasing version counter — bumped when WebDAV covers finish
 * downloading so the browser re-fetches previously-404'd cover images.
 */
let coverVersion = 0

export function bumpCoverVersion() {
  coverVersion += 1
}

export function getCoverVersion() {
  return coverVersion
}

/**
 * Build a cover image URL that goes through Tauri's custom `bookcover` protocol.
 * The browser handles caching (`Cache-Control: immutable`) and lazy loading natively.
 * Includes a `_v` query param that bumps when WebDAV covers are downloaded,
 * forcing the browser to re-fetch covers that previously returned 404.
 */
export function buildCoverUrl(libraryId: string, bookPath: string): string {
  const bytes = new TextEncoder().encode(bookPath)
  let binary = ""
  for (const b of bytes) binary += String.fromCharCode(b)
  const encoded = btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")

  const path = `${libraryId}/${encoded}`
  const base = IS_WINDOWS
    ? `http://bookcover.localhost/${path}`
    : `bookcover://localhost/${path}`
  return coverVersion > 0 ? `${base}?_v=${coverVersion}` : base
}