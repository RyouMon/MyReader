import type { TocItem } from "../types"

const COMIC_IMAGE_EXTS = new Set([
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "bmp",
  "avif",
])

export type ComicSpineItem = {
  index: number
  path: string
  title: string
  contentWeight: number
}

export type ComicPageEntry = ComicSpineItem & {
  directory: string | null
  fileName: string
}

export type ComicManifest = {
  pages: ComicPageEntry[]
  toc: TocItem[]
}

export function isComicImagePath(path: string): boolean {
  if (!path || path.startsWith("__MACOSX") || path.startsWith(".")) {
    return false
  }

  const normalized = path.replace(/\\/g, "/")
  const segments = normalized.split("/")
  if (segments.some((segment) => segment.startsWith("."))) {
    return false
  }

  const ext = normalized.split(".").pop()?.toLowerCase() ?? ""
  return COMIC_IMAGE_EXTS.has(ext)
}

export function buildComicManifest(paths: readonly string[]): ComicManifest {
  const pages = paths
    .filter(isComicImagePath)
    .slice()
    .sort(naturalCompare)
    .map((path, index) => {
      const normalizedPath = path.replace(/\\/g, "/")
      const parts = normalizedPath.split("/")
      const fileName = parts[parts.length - 1] ?? normalizedPath
      const directory = parts.length > 1 ? parts.slice(0, -1).join("/") : null
      return {
        index,
        path: normalizedPath,
        title: `Page ${index + 1}`,
        contentWeight: 1,
        directory,
        fileName,
      } satisfies ComicPageEntry
    })

  if (pages.length === 0) {
    throw new Error("No image files found in CBZ archive")
  }

  return {
    pages,
    toc: buildComicToc(pages),
  }
}

function buildComicToc(pages: readonly ComicPageEntry[]): TocItem[] {
  const dirs = new Map<string, number>()
  for (const page of pages) {
    if (!page.directory) continue
    if (!dirs.has(page.directory)) {
      dirs.set(page.directory, page.index)
    }
  }

  if (dirs.size <= 1) return []

  return Array.from(dirs.entries()).map(([dir, pageIndex]) => ({
    label: dir.split("/").pop() || dir,
    href: dir,
    index: pageIndex,
    subitems: undefined,
  }))
}

function naturalCompare(a: string, b: string): number {
  const sa = splitSegments(a)
  const sb = splitSegments(b)
  const len = Math.min(sa.length, sb.length)

  for (let i = 0; i < len; i++) {
    const av = sa[i]
    const bv = sb[i]
    if (typeof av === "number" && typeof bv === "number") {
      if (av !== bv) return av - bv
    } else {
      const cmp = String(av).localeCompare(String(bv))
      if (cmp !== 0) return cmp
    }
  }
  return sa.length - sb.length
}

function splitSegments(s: string): (string | number)[] {
  const result: (string | number)[] = []
  for (const part of s.split(/(\d+)/)) {
    if (!part) continue
    const n = Number(part)
    result.push(Number.isNaN(n) ? part.toLowerCase() : n)
  }
  return result
}
