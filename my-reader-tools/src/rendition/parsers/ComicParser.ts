import { unzipSync } from "fflate"

import type {
  IParser,
  ChapterInfo,
  ImageChapterData,
  ParsedBook,
  TocItem,
} from "../types"

const IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "gif", "webp", "bmp", "avif"])

/**
 * Parser for CBZ (Comic Book ZIP) archives.
 *
 * Extracts image files from the ZIP, sorts by filename,
 * and exposes each image as a page via blob URLs.
 */
export class ComicParser implements IParser {
  private images: { name: string; data: Uint8Array }[] = []
  private blobUrls: string[] = []
  private cache = new Map<number, ImageChapterData>()

  async parse(buffer: ArrayBuffer): Promise<ParsedBook> {
    const raw = new Uint8Array(buffer)
    if (raw.length < 4 || raw[0] !== 0x50 || raw[1] !== 0x4b) {
      throw new Error(
        "漫画文件不是 ZIP 格式。CBR（RAR）暂不支持，请在 Calibre 中转为 CBZ 后阅读。",
      )
    }

    const files = unzipSync(raw)

    this.images = Object.entries(files)
      .filter(([name]) => isImageFile(name))
      .sort(([a], [b]) => naturalCompare(a, b))
      .map(([name, data]) => ({ name, data }))

    if (this.images.length === 0) {
      throw new Error("No image files found in CBZ archive")
    }

    const chapters: ChapterInfo[] = this.images.map((img, i) => ({
      index: i,
      title: `Page ${i + 1}`,
      href: img.name,
      contentWeight: 1,
    }))

    const toc = buildComicToc(this.images)

    return {
      metadata: {},
      toc,
      chapters,
      layoutMode: "fixedLayout",
    }
  }

  async getChapter(index: number): Promise<ImageChapterData> {
    if (this.cache.has(index)) return this.cache.get(index)!

    const img = this.images[index]
    if (!img) throw new Error("Page index out of range: " + index)

    const mime = guessImageMime(img.name)
    const url = URL.createObjectURL(
      new Blob([img.data.slice()], { type: mime }),
    )
    this.blobUrls.push(url)

    const page: ImageChapterData = {
      type: "image",
      index,
      title: `Page ${index + 1}`,
      href: img.name,
      contentWeight: 1,
      imageUrl: url,
    }

    this.cache.set(index, page)
    return page
  }

  destroy(): void {
    for (const url of this.blobUrls) URL.revokeObjectURL(url)
    this.blobUrls = []
    this.cache.clear()
    this.images = []
  }
}

function isImageFile(name: string): boolean {
  if (name.startsWith("__MACOSX") || name.startsWith(".")) return false
  const ext = name.split(".").pop()?.toLowerCase() ?? ""
  return IMAGE_EXTS.has(ext)
}

function guessImageMime(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? ""
  const map: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    bmp: "image/bmp",
    avif: "image/avif",
  }
  return map[ext] || "image/jpeg"
}

/**
 * Natural sort comparison for filenames like "page1.jpg", "page2.jpg", "page10.jpg".
 * Splits each filename into text/number segments and compares segment by segment.
 */
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

/**
 * Build a simple TOC from directory structure.
 * Groups images by their parent directory, creating a chapter entry per folder.
 */
function buildComicToc(images: { name: string }[]): TocItem[] {
  const dirs = new Map<string, number>()
  for (let i = 0; i < images.length; i++) {
    const parts = images[i].name.split("/")
    if (parts.length < 2) continue
    const dir = parts.slice(0, -1).join("/")
    if (!dirs.has(dir)) {
      dirs.set(dir, i)
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
