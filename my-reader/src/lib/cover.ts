/**
 * Windows WebView2 converts custom URI schemes to `http://{scheme}.localhost/`.
 * macOS/Linux WebKit keeps `{scheme}://localhost/`.
 * Detect once at module load.
 */
const IS_WINDOWS = navigator.userAgent.includes("Windows")

/**
 * Build a cover image URL that goes through Tauri's custom `bookcover` protocol.
 * The browser handles caching (`Cache-Control: immutable`) and lazy loading natively.
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
  return IS_WINDOWS
    ? `http://bookcover.localhost/${path}`
    : `bookcover://localhost/${path}`
}
