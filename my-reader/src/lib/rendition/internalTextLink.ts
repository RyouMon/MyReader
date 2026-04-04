import type { ChapterInfo, ResolvedInternalTextLink } from "./types"

/**
 * `http:`, `mailto:`, `//example.com/...`, etc. — not in-book relative paths.
 */
export function isNonBookSchemeHref(href: string): boolean {
  const t = href.trim()
  if (t.startsWith("//")) return true
  return /^(?!blob)[a-z][a-z0-9+.-]*:/i.test(t)
}

export function normalizeChapterPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\/+/, "")
}

export function chapterPathDirname(path: string): string {
  const idx = path.lastIndexOf("/")
  return idx >= 0 ? path.slice(0, idx) : ""
}

export function stripPathHash(path: string): string {
  const i = path.indexOf("#")
  return i >= 0 ? path.slice(0, i) : path
}

/** Normalized manifest path without `#fragment` (for spine href matching). */
export function stripChapterHrefHash(href: string): string {
  return normalizeChapterPath(stripPathHash(href) || "")
}

export function resolveChapterRelativePath(baseDir: string, relative: string): string {
  if (!baseDir) return normalizeChapterPath(relative)
  if (relative.startsWith("/")) return normalizeChapterPath(relative.substring(1))
  const parts = normalizeChapterPath(baseDir).split("/").filter(Boolean)
  for (const seg of normalizeChapterPath(relative).split("/")) {
    if (!seg || seg === ".") continue
    if (seg === "..") parts.pop()
    else parts.push(seg)
  }
  return parts.join("/")
}

export function decodeLinkFragment(raw: string): string {
  try {
    return decodeURIComponent(raw.replace(/\+/g, " "))
  } catch {
    return raw
  }
}

export function basenameChapterPath(path: string): string {
  const parts = normalizeChapterPath(path).split("/").filter(Boolean)
  return parts[parts.length - 1] ?? ""
}

function tryDecodeUriPath(s: string): string {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

function findChapterIndexByHref(
  chapters: readonly ChapterInfo[],
  targetPath: string,
): number {
  const norm = normalizeChapterPath(targetPath)
  const normDecoded = tryDecodeUriPath(norm)

  for (let i = 0; i < chapters.length; i++) {
    const c = normalizeChapterPath(stripPathHash(chapters[i].href))
    if (c === norm || c === normDecoded) return i
    const cDec = tryDecodeUriPath(c)
    if (cDec === norm || cDec === normDecoded) return i
  }

  const base = basenameChapterPath(norm)
  if (!base) return -1
  const hits: number[] = []
  for (let i = 0; i < chapters.length; i++) {
    if (basenameChapterPath(stripPathHash(chapters[i].href)) === base) hits.push(i)
  }
  return hits.length === 1 ? hits[0]! : -1
}

/**
 * Resolves `href` using spine `chapters[].href` and POSIX-style relative paths.
 * Used for HTML / multi-file text books without a package-specific resolver.
 */
export function genericResolveInternalTextLink(
  chapters: readonly ChapterInfo[],
  fromChapterIndex: number,
  rawHref: string,
): ResolvedInternalTextLink | null {
  const trimmed = rawHref.trim()
  if (!trimmed || isNonBookSchemeHref(trimmed)) return null

  const info = chapters[fromChapterIndex]
  if (!info) return null

  const hashIdx = trimmed.indexOf("#")
  const pathPart = hashIdx >= 0 ? trimmed.slice(0, hashIdx) : trimmed
  const fragment =
    hashIdx >= 0 && hashIdx < trimmed.length - 1
      ? decodeLinkFragment(trimmed.slice(hashIdx + 1))
      : null

  const currentPath = stripChapterHrefHash(info.href)
  const targetPath =
    !pathPart || pathPart === ""
      ? currentPath
      : resolveChapterRelativePath(chapterPathDirname(currentPath), pathPart)

  const chapterIndex = findChapterIndexByHref(chapters, targetPath)
  if (chapterIndex < 0) return null
  return { chapterIndex, fragmentId: fragment }
}
