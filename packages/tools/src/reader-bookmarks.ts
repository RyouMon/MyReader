import type { ReaderLocator } from "./reader-toc"

const LOCATOR_KEY_VERSION = "v2"
const PROGRESSION_KEY_SCALE = 1_000_000
const FNV1A_128_OFFSET = 0x6c62272e07bb014262b821756295c58dn
const FNV1A_128_PRIME = 0x0000000001000000000000000000013bn
const UINT128_MASK = (1n << 128n) - 1n

export type ReaderBookmarkLike = {
  id?: string
  createdAt?: number
  locator: ReaderLocator
}

function splitHrefFragment(href: string): {
  href: string
  fragment?: string
} {
  const index = href.indexOf("#")
  if (index < 0) return { href }

  const fragment = href.slice(index + 1)
  return {
    href: href.slice(0, index),
    ...(fragment ? { fragment } : {}),
  }
}

function encodeResourcePath(path: string): string {
  return path
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/")
}

function decodedUrlPath(url: URL): string {
  try {
    return decodeURIComponent(url.pathname)
  } catch {
    return url.pathname
  }
}

/**
 * Removes process-local Tauri/file origins while retaining a valid,
 * percent-encoded publication-relative resource path.
 */
function canonicalizeLocalHref(href: string): string {
  let url: URL
  try {
    url = new URL(href)
  } catch {
    return href
  }

  const protocol = url.protocol.toLowerCase()
  const isTauriAssetHost =
    (protocol === "http:" || protocol === "https:") &&
    url.hostname.toLowerCase() === "asset.localhost"
  if (protocol !== "asset:" && protocol !== "file:" && !isTauriAssetHost) {
    return href
  }

  const path = decodedUrlPath(url).replace(/\\/g, "/")
  const extracted = /(?:^|\/)extracted\/[^/]+\/(.+)$/.exec(path)
  if (extracted?.[1]) return encodeResourcePath(extracted[1])

  const segments = path.split("/").filter(Boolean)
  const fileName = segments[segments.length - 1]
  return fileName ? encodeResourcePath(fileName) : href
}

function normalizeFragment(fragment: string): string {
  return fragment.startsWith("#") ? fragment.slice(1) : fragment
}

function uniqueFragments(fragments: readonly string[]): string[] {
  const result: string[] = []
  for (const raw of fragments) {
    const fragment = normalizeFragment(raw)
    if (fragment && !result.includes(fragment)) result.push(fragment)
  }
  return result
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function flattenOtherLocations(value: unknown): Record<string, unknown> {
  if (value instanceof Map) {
    return Object.fromEntries(
      [...value.entries()].filter(
        (entry): entry is [string, unknown] => typeof entry[0] === "string",
      ),
    )
  }
  return isRecord(value) ? { ...value } : {}
}

function canonicalizeLocations(
  locations: NonNullable<ReaderLocator["locations"]>,
  fragments: string[],
): NonNullable<ReaderLocator["locations"]> {
  const { otherLocations, ...flatLocations } = locations
  const result: NonNullable<ReaderLocator["locations"]> = {
    ...flattenOtherLocations(otherLocations),
    ...flatLocations,
  }

  if (fragments.length > 0) result.fragments = fragments
  else delete result.fragments

  return result
}

/**
 * Produces a platform-neutral Readium Locator for persistence and sync.
 *
 * Readium requires resource fragments in `locations.fragments`, not in `href`.
 * The input is never mutated.
 */
export function canonicalizeReaderLocatorForStorage(
  locator: ReaderLocator,
): ReaderLocator {
  const { href: rawHref, fragment } = splitHrefFragment(locator.href)
  const fragments = uniqueFragments([
    ...(fragment ? [fragment] : []),
    ...(locator.locations?.fragments ?? []),
  ])

  const locations = locator.locations
    ? canonicalizeLocations(locator.locations, fragments)
    : fragments.length > 0
      ? { progression: 0, fragments }
      : undefined
  const href =
    locator.type.toLowerCase() === "application/pdf"
      ? "publication.pdf"
      : canonicalizeLocalHref(rawHref)

  return {
    ...locator,
    href,
    ...(locations ? { locations } : { locations: undefined }),
    ...(locator.text ? { text: { ...locator.text } } : {}),
  }
}

function finiteNumber(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function canonicalJsonValue(value: unknown): string | undefined {
  if (value === null) return "null"
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value)
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? JSON.stringify(value) : "null"
  }
  if (Array.isArray(value)) {
    return `[${value
      .map((item) => canonicalJsonValue(item) ?? "null")
      .join(",")}]`
  }
  if (isRecord(value)) {
    const entries = Object.keys(value)
      .sort()
      .flatMap((key) => {
        const item = canonicalJsonValue(value[key])
        return item === undefined ? [] : [`${JSON.stringify(key)}:${item}`]
      })
    return `{${entries.join(",")}}`
  }
  return undefined
}

function shortStableHash(value: string): string {
  let hash = FNV1A_128_OFFSET
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= BigInt(byte)
    hash = (hash * FNV1A_128_PRIME) & UINT128_MASK
  }
  return hash.toString(16).padStart(32, "0")
}

function bookmarkIdentityPayload(
  locator: ReaderLocator,
): Record<string, unknown> {
  const locations = locator.locations
  const base = { href: locator.href, type: locator.type }
  if (locations?.partialCfi) {
    return {
      ...base,
      anchor: { kind: "partialCfi", value: locations.partialCfi },
    }
  }
  if (locations?.domRange != null) {
    return {
      ...base,
      anchor: { kind: "domRange", value: locations.domRange },
    }
  }
  if (locations?.cssSelector) {
    return {
      ...base,
      anchor: { kind: "cssSelector", value: locations.cssSelector },
    }
  }
  if (locations?.fragments && locations.fragments.length > 0) {
    return {
      ...base,
      anchor: { kind: "fragments", value: locations.fragments },
    }
  }

  const position = finiteNumber(locations?.position)
  if (position !== undefined && position >= 1) {
    return { ...base, position: Math.floor(position) }
  }

  const totalProgression = finiteNumber(locations?.totalProgression)
  if (totalProgression !== undefined) {
    return {
      ...base,
      totalProgression: Math.round(totalProgression * PROGRESSION_KEY_SCALE),
    }
  }

  const progression = finiteNumber(locations?.progression)
  return {
    ...base,
    progression:
      progression === undefined
        ? null
        : Math.round(progression * PROGRESSION_KEY_SCALE),
  }
}

/**
 * Returns the v2 natural key for one location within a caller-scoped book and
 * format. Precise Readium anchors take priority over layout-dependent
 * progressions; position/progression are deterministic fallbacks.
 */
export function readerBookmarkLocatorKey(locator: ReaderLocator): string {
  const canonical = canonicalizeReaderLocatorForStorage(locator)
  const identity = canonicalJsonValue(bookmarkIdentityPayload(canonical))
  return `${LOCATOR_KEY_VERSION}:${shortStableHash(identity ?? "null")}`
}

export function sameReaderBookmarkLocation(
  left: ReaderLocator,
  right: ReaderLocator,
): boolean {
  return readerBookmarkLocatorKey(left) === readerBookmarkLocatorKey(right)
}

function compareNumbers(
  left: number | undefined,
  right: number | undefined,
): number {
  if (left === undefined && right === undefined) return 0
  if (left === undefined) return 1
  if (right === undefined) return -1
  return left - right
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

/** Deterministic reading-order comparison for canonical or native Locators. */
export function compareReaderBookmarkLocators(
  left: ReaderLocator,
  right: ReaderLocator,
): number {
  const a = canonicalizeReaderLocatorForStorage(left)
  const b = canonicalizeReaderLocatorForStorage(right)

  const byPosition = compareNumbers(
    finiteNumber(a.locations?.position),
    finiteNumber(b.locations?.position),
  )
  if (byPosition !== 0) return byPosition

  const byTotalProgression = compareNumbers(
    finiteNumber(a.locations?.totalProgression),
    finiteNumber(b.locations?.totalProgression),
  )
  if (byTotalProgression !== 0) return byTotalProgression

  const byHref = compareStrings(a.href, b.href)
  if (byHref !== 0) return byHref

  const byProgression = compareNumbers(
    finiteNumber(a.locations?.progression),
    finiteNumber(b.locations?.progression),
  )
  if (byProgression !== 0) return byProgression

  return compareStrings(
    a.locations?.fragments?.join("\u001f") ?? "",
    b.locations?.fragments?.join("\u001f") ?? "",
  )
}

/** Returns a new array in deterministic publication reading order. */
export function sortReaderBookmarks<T extends ReaderBookmarkLike>(
  bookmarks: readonly T[],
): T[] {
  return [...bookmarks].sort((left, right) => {
    const byLocator = compareReaderBookmarkLocators(left.locator, right.locator)
    if (byLocator !== 0) return byLocator

    const byCreatedAt = compareNumbers(
      finiteNumber(left.createdAt),
      finiteNumber(right.createdAt),
    )
    if (byCreatedAt !== 0) return byCreatedAt

    return compareStrings(left.id ?? "", right.id ?? "")
  })
}
