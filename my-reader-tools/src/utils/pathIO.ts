/**
 * Returns true when value already looks like a URL.
 */
function isLikelyUrl(value: string): boolean {
  return /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(value)
}

/**
 * Converts a local filesystem path into a fetchable file URL.
 */
export function toFetchableUrl(pathOrUrl: string): string {
  const raw = pathOrUrl.trim()
  if (!raw) return raw
  if (isLikelyUrl(raw)) return raw
  const normalized = raw.replace(/\\/g, "/")
  if (/^[a-zA-Z]:\//.test(normalized)) {
    return `file:///${normalized}`
  }
  if (normalized.startsWith("/")) {
    return `file://${normalized}`
  }
  return `file://${normalized}`
}

/**
 * Resolves a relative path against a directory path/URL.
 */
export function resolveRelativePath(
  baseDirPathOrUrl: string,
  relativePath: string,
): string {
  const baseUrl = toFetchableUrl(baseDirPathOrUrl).replace(/\/?$/, "/")
  return new URL(relativePath, baseUrl).toString()
}

declare global {
  interface Window {
    /** Host (e.g. RN WebView) can supply a reader when `fetch(file:)` is blocked. */
    __myReaderToolsReadBinary?: (url: string) => Promise<Uint8Array>
  }
}

function readBinaryViaXhr(url: string): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("GET", url, true)
    xhr.responseType = "arraybuffer"
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300 && xhr.response) {
        resolve(new Uint8Array(xhr.response as ArrayBuffer))
        return
      }
      reject(new Error(`XHR ${xhr.status} for ${url}`))
    }
    xhr.onerror = () => reject(new Error(`XHR failed for ${url}`))
    xhr.send()
  })
}

/**
 * Reads binary bytes from path/URL through fetch.
 */
export async function fetchBinary(pathOrUrl: string): Promise<Uint8Array> {
  const target = toFetchableUrl(pathOrUrl)
  const hook =
    typeof window !== "undefined" ? window.__myReaderToolsReadBinary : undefined
  if (hook) {
    return hook(target)
  }
  try {
    const res = await fetch(target)
    if (res.ok) {
      return new Uint8Array(await res.arrayBuffer())
    }
    if (!/^file:/i.test(target)) {
      throw new Error(
        `Failed to fetch file: ${target} (${res.status} ${res.statusText})`,
      )
    }
  } catch (err) {
    if (!/^file:/i.test(target)) {
      throw err instanceof Error ? err : new Error(String(err))
    }
  }
  return readBinaryViaXhr(target)
}

/**
 * Reads utf-8 text from path/URL through fetch.
 */
export async function fetchText(pathOrUrl: string): Promise<string> {
  const bytes = await fetchBinary(pathOrUrl)
  return new TextDecoder("utf-8").decode(bytes)
}
