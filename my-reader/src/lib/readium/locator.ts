import { Locator } from "@readium/shared"

export function parseSavedLocator(data: unknown): Locator | null {
  if (data == null || typeof data !== "object") return null
  return Locator.deserialize(data) ?? null
}

/**
 * Strip platform-specific prefix from href for cross-platform storage.
 * Desktop CBZ/PDF hrefs contain `asset://localhost/<extracted-dir>/` which
 * is invalid on mobile. We keep only the relative path suffix.
 */
function normalizeHrefForStorage(href: string): string {
  if (!href.startsWith("asset://localhost/")) return href
  try {
    const url = new URL(href)
    const decoded = decodeURIComponent(url.pathname)
    // Extracted dir boundary: /extracted/<uuid-like-segment>/
    const match = decoded.match(/\/extracted\/[^/]+\//)
    if (match) {
      const relativePath = decoded.slice((match.index ?? 0) + match[0].length)
      if (relativePath) return relativePath
    }
  } catch {
    // URL parsing failed — return as-is
  }
  return href
}

export function locatorToJson(locator: Locator): Record<string, unknown> {
  const raw = locator.serialize() as Record<string, unknown>
  const href = raw.href
  if (typeof href === "string") {
    raw.href = normalizeHrefForStorage(href)
  }
  return raw
}
