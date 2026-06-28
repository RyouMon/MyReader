/**
 * Local & WebDAV path unification utilities.
 *
 * ## Multi-encoding origins (e.g. `%2520`)
 *
 * 1. **True source**: Calibre `metadata.db` relative paths should be "plaintext"
 *    directory/file names (with spaces, brackets, Japanese, etc.).
 * 2. **Contamination**: If somewhere a `encodeURIComponent`'d string is saved or
 *    re-passed as a path segment (e.g. persistence, log backfill, old bug),
 *    the segment literal becomes `Wei%20Zhi` instead of `Wei Zhi`.
 * 3. **Double encoding**: Calling `encodeURIComponent` on such a segment turns
 *    `%` into `%25`, producing `%2520`; or Expo `File`/`Directory` stacks another
 *    layer on an already-encoded URI.
 * 4. **Consequence**: Native downloader writes path A, JS side assembles path B
 *    with different encoding — "downloaded but size=0 / can't open / unzip fails".
 *
 * ## Conventions
 *
 * - **Logical relative paths** (manifest, `file_state.path`, Calibre relative paths):
 *   understood as plaintext segments; if a segment contains `%`, iteratively
 *   decode to stable before joining any local file or URL.
 * - **Local `file://` URIs**: use {@link fileUriFor} / {@link toFileUri},
 *   which handle scheme & decoding uniformly here.
 * - **WebDAV URL paths**: use {@link encodeUrlPathFromChunks}, encoding each
 *   segment **only** once with `encodeURIComponent`.
 */

import { Directory, Paths } from "expo-file-system"
import i18n from "@/src/i18n"
import { AppInvariantError } from "@/src/errors"

/** Max decode rounds for `%` sequences within a single path segment. */
const IO_PATH_MAX_PERCENT_DECODE_ROUNDS = 8

/** Rejects empty, absolute, or traversal relative paths. */
export function assertSafeRelativePath(relativePath: string): void {
  if (!relativePath) {
    throw new AppInvariantError("Relative path must not be empty")
  }
  if (relativePath.includes("..")) {
    throw new AppInvariantError(
      `Relative path must not contain '..': ${relativePath}`,
    )
  }
  if (relativePath.startsWith("/")) {
    throw new AppInvariantError(
      `Relative path must not be absolute: ${relativePath}`,
    )
  }
}

/**
 * Normalize a "library-relative path": trim whitespace, backslashes to
 * forward slashes, strip leading/trailing `/`.
 */
function normalizeRelativePath(path: string): string {
  const trimmed = path.trim().replace(/\\/g, "/")
  return trimmed.replace(/^\/+/, "").replace(/\/+$/, "")
}

/**
 * Decode a single path segment from possible "multi-percent-encoding" back to
 * plaintext, until stable or illegal encoding encountered.
 */
function decodePathSegmentToPlainText(segment: string): string {
  let current = segment
  for (let round = 0; round < IO_PATH_MAX_PERCENT_DECODE_ROUNDS; round += 1) {
    try {
      const next = decodeURIComponent(current)
      if (next === current) break
      current = next
    } catch {
      break
    }
  }
  return current
}

/**
 * Decode an entire path by splitting on `/` then decoding each segment,
 * avoiding `%2F` etc. changing segment boundaries before decoding.
 */
function decodePathToPlainText(path: string): string {
  return path
    .replace(/\\/g, "/")
    .split("/")
    .map((segment) =>
      segment ? decodePathSegmentToPlainText(segment) : segment,
    )
    .join("/")
}

/**
 * Relative path → plaintext path segment array (normalized, decoded per-segment).
 */
export function canonicalRelativePathSegments(relativePath: string): string[] {
  const rel = normalizeRelativePath(relativePath)
  return rel
    .split("/")
    .filter(Boolean)
    .map((segment) => decodePathSegmentToPlainText(segment))
}

/**
 * Canonical "plaintext" form of a relative path (joined with `/`), useful for
 * logging or comparing with remote plaintext paths.
 */
export function canonicalRelativePath(relativePath: string): string {
  return canonicalRelativePathSegments(relativePath).join("/")
}

/**
 * Join a Calibre book folder path with a file segment (e.g. cover.jpg or a format filename).
 */
export function joinRelativePath(
  bookPath: string | null | undefined,
  segment: string,
): string {
  const normalizedSegment = segment.replace(/^\/+/, "")
  if (!bookPath) return normalizedSegment
  const normalizedBookPath = bookPath.replace(/\\/g, "/").replace(/\/+$/, "")
  return normalizedBookPath
    ? `${normalizedBookPath}/${normalizedSegment}`
    : normalizedSegment
}

/**
 * Resolve a relative path under an existing directory URI to get the target
 * file's `file://` URI. All segments are first normalized to plaintext, then
 * passed to Expo `File`/`Directory` constructors, avoiding manual concatenation
 * and double-encoding.
 */
export function fileUriFor(baseDirUri: string, relativePath: string): string {
  const base = toNativeFilesystemPath(baseDirUri).replace(/\/+$/, "")
  const segments = canonicalRelativePathSegments(relativePath)
  return toFileUri([base, ...segments].join("/"))
}

function encodeRelativePathForWebUrl(relativePath: string): string {
  return canonicalRelativePathSegments(relativePath)
    .map((segment) => encodeURIComponent(segment))
    .join("/")
}

/**
 * Concatenate multiple "possibly `/`-containing" sub-paths (e.g. rootPath,
 * libraryPath, relativePath), normalizing each then URL-encoding each chunk,
 * joining chunks with `/`.
 */
export function encodeUrlPathFromChunks(...pathChunks: string[]): string {
  return pathChunks
    .map((chunk) => normalizeRelativePath(chunk))
    .filter(Boolean)
    .map((chunk) => encodeRelativePathForWebUrl(chunk))
    .join("/")
}

/**
 * Check whether a string is a local file URI.
 */
function isFileUri(value: string): boolean {
  return value.trim().startsWith("file:")
}

/**
 * Normalize a native absolute path or bare path into a `file:` URI for use
 * with Expo `File` / `Directory` / legacy file-system.
 */
function toFileUri(pathOrUri: string): string {
  const normalized = pathOrUri.replace(/\\/g, "/").trim()
  const nativePath = isFileUri(normalized)
    ? toNativeFilesystemPath(normalized)
    : decodePathToPlainText(normalized)
  const encodedPath = nativePath
    .split("/")
    .map((segment) => (segment ? encodeURIComponent(segment) : segment))
    .join("/")
  return encodedPath.startsWith("/")
    ? `file://${encodedPath}`
    : `file:///${encodedPath}`
}

/**
 * Convert a `file:` URI or bare path to a native filesystem path string
 * (strip scheme, decode each segment). Used by background downloader
 * destination/source, SQLite location, zip extractor, and other native API
 * interaction scenarios.
 */
export function toNativeFilesystemPath(pathOrUri: string): string {
  const normalized = pathOrUri.replace(/\\/g, "/").trim()
  if (!isFileUri(normalized)) {
    return decodePathToPlainText(normalized)
  }
  try {
    return decodePathToPlainText(new URL(normalized).pathname)
  } catch {
    const stripped = normalized.replace(/^file:\/\//, "").replace(/^file:/, "")
    return decodePathToPlainText(
      stripped.startsWith("/") ? stripped : `/${stripped}`,
    )
  }
}

/**
 * Return the parent directory URI of a file URI, avoiding callers manually
 * truncating strings to拼 `file://`.
 */
export function parentDirectoryUriForFileUri(fileUri: string): string | null {
  const nativePath = toNativeFilesystemPath(fileUri).replace(/\/+$/, "")
  const lastSlash = nativePath.lastIndexOf("/")
  if (lastSlash <= 0) return null
  return toFileUri(nativePath.slice(0, lastSlash))
}

/**
 * Split a file URI into native directory path and filename, for op-sqlite's
 * `{ location, name }`.
 */
export function fileUriToNativeDirAndName(fileUri: string): {
  dir: string
  name: string
} {
  const nativePath = toNativeFilesystemPath(fileUri).replace(/\/+$/, "")
  const lastSlash = nativePath.lastIndexOf("/")
  if (lastSlash <= 0) {
    throw new Error(i18n.t("sync.cannotParseFilePath", { uri: fileUri }))
  }
  return {
    dir: nativePath.slice(0, lastSlash),
    name: nativePath.slice(lastSlash + 1),
  }
}

/** Creates (if needed) and returns a subdirectory under the app document directory. */
export function ensureDocumentSubdirUri(...segments: string[]): string {
  const dir = new Directory(Paths.document, ...segments)
  if (!dir.exists) {
    dir.create({ idempotent: true, intermediates: true })
  }
  return dir.uri
}
