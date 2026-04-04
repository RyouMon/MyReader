import { unzipSync } from "fflate"

import {
  EPUB,
  type EpubBookShape,
  type EpubSection,
} from "@/lib/foliate-js/epub.js"
import type {
  BookMetadata,
  ChapterInfo,
  IParser,
  ParsedBook,
  TextChapterData,
  TocItem,
} from "../types"

/**
 * EPUB parser implemented on top of `foliate-js/epub.js`.
 */
export class EpubParser implements IParser {
  private files = new Map<string, Uint8Array>()
  private foliateBook: EpubBookShape | null = null
  private chapterIndex: ChapterInfo[] = []
  private chapterCache = new Map<number, TextChapterData>()
  private resourceCache = new Map<string, string>()
  private blobUrls: string[] = []
  private titleByHref = new Map<string, string>()

  /**
   * Parses EPUB archive and builds metadata/toc/chapter descriptors.
   */
  async parse(buffer: ArrayBuffer): Promise<ParsedBook> {
    this.resetState()
    this.files = toFileMap(unzipSync(new Uint8Array(buffer)))

    const foliate = new EPUB({
      loadText: async (uri: string) => this.readTextFile(uri),
      loadBlob: async (uri: string) =>
        this.readBinaryFile(uri) ?? new Uint8Array(),
      getSize: (uri: string) => this.readBinaryFile(uri)?.byteLength ?? 0,
      sha1: async (data: ArrayBuffer) => computeSha1Hex(data),
    })
    await foliate.init()
    this.foliateBook = foliate

    const toc = this.normalizeToc(foliate.toc ?? [])
    this.assignTocSpineIndices(toc)
    for (const item of this.flattenToc(toc)) {
      const href = stripHash(item.href)
      if (href) this.titleByHref.set(href, item.label)
    }

    this.chapterIndex = this.foliateBook.sections.map(
      (section: EpubSection, index: number) => {
        const href = stripHash(section.id)
        const title =
          this.titleByHref.get(href) ??
          this.titleByHref.get(decodeURIComponent(href)) ??
          ""
        return { index, href, title }
      },
    )

    return {
      metadata: this.normalizeMetadata(foliate.metadata ?? {}),
      toc,
      chapters: this.chapterIndex,
      contentType: "text",
    }
  }

  /**
   * Loads one chapter document and resolves its CSS/resources.
   */
  async getChapter(index: number): Promise<TextChapterData> {
    if (this.chapterCache.has(index)) return this.chapterCache.get(index)!
    if (!this.foliateBook) throw new Error("Call parse() before getChapter()")
    const section = this.foliateBook.sections[index]
    const info = this.chapterIndex[index]
    if (!section || !info)
      throw new Error("Chapter index out of range: " + index)

    const doc = await section.createDocument()
    const chapterDir = getDirname(info.href)
    const cssText = this.collectCss(doc, chapterDir)
    this.resolveImages(doc, chapterDir)
    const text = (doc.body?.textContent || "").trim()
    const bodyHtml = doc.body?.innerHTML || ""
    const title =
      info.title || this.firstHeading(doc) || "Chapter " + String(index + 1)

    const chapter: TextChapterData = {
      type: "text",
      index,
      title,
      href: info.href,
      bodyHtml,
      cssText,
      text,
    }
    this.chapterCache.set(index, chapter)
    return chapter
  }

  /**
   * Releases parser caches and object URLs.
   */
  destroy(): void {
    for (const url of this.blobUrls) URL.revokeObjectURL(url)
    this.blobUrls = []
    this.foliateBook?.destroy?.()
    this.resetState()
  }

  private resetState(): void {
    this.files.clear()
    this.foliateBook = null
    this.chapterIndex = []
    this.chapterCache.clear()
    this.resourceCache.clear()
    this.titleByHref.clear()
  }

  private readTextFile(uri: string): string {
    const data = this.readBinaryFile(uri)
    if (!data) return ""
    return new TextDecoder("utf-8").decode(data)
  }

  private readBinaryFile(uri: string): Uint8Array | null {
    const hit = this.files.get(normalizePath(uri))
    if (hit) return hit
    const decoded = decodeURIComponent(uri)
    if (decoded !== uri) return this.files.get(normalizePath(decoded)) ?? null
    return null
  }

  private normalizeMetadata(raw: Record<string, unknown>): BookMetadata {
    return {
      title: pickString(raw.title),
      author: pickString(raw.author) ?? pickString(raw.creator),
      description: pickString(raw.description),
      publisher: pickString(raw.publisher),
      language: pickString(raw.language),
    }
  }

  private normalizeToc(raw: unknown[]): TocItem[] {
    return raw
      .map((item, index) => {
        if (!item || typeof item !== "object") return null
        const row = item as Record<string, unknown>
        const href = pickString(row.href) ?? ""
        const label =
          pickString(row.label) ??
          pickString(row.title) ??
          `Chapter ${index + 1}`
        const subitems = Array.isArray(row.subitems)
          ? this.normalizeToc(row.subitems)
          : Array.isArray(row.items)
            ? this.normalizeToc(row.items)
            : undefined
        return {
          label,
          href: stripHash(href),
          index: 0,
          subitems,
        } satisfies TocItem
      })
      .filter(Boolean) as TocItem[]
  }

  /**
   * 将每条目录项的 index 设为 spine 章节下标（与 {@link gotoChapter} 一致）。
   * 无 href 的容器节点使用第一个可解析子项的章节下标。
   */
  private assignTocSpineIndices(items: TocItem[]): void {
    for (const item of items) {
      if (item.subitems?.length) this.assignTocSpineIndices(item.subitems)
      let idx = this.resolveTocSpineIndex(item.href)
      if (idx < 0 && item.subitems?.length)
        idx = this.firstDescendantSpineIndex(item.subitems)
      item.index = idx >= 0 ? idx : 0
    }
  }

  private resolveTocSpineIndex(href: string): number {
    if (!this.foliateBook || !href.trim()) return -1
    let r = this.foliateBook.resolveHref(href)
    if ((r?.index ?? -1) < 0 && href !== decodeURIComponent(href)) {
      r = this.foliateBook.resolveHref(decodeURIComponent(href))
    }
    const i = r?.index
    return typeof i === "number" && i >= 0 ? i : -1
  }

  private firstDescendantSpineIndex(items: TocItem[]): number {
    for (const s of items) {
      const i = this.resolveTocSpineIndex(s.href)
      if (i >= 0) return i
      if (s.subitems?.length) {
        const j = this.firstDescendantSpineIndex(s.subitems)
        if (j >= 0) return j
      }
    }
    return -1
  }

  private collectCss(doc: Document, chapterDir: string): string {
    const parts: string[] = []
    for (const style of Array.from(doc.querySelectorAll("style"))) {
      const css = this.resolveCssUrls(style.textContent || "", chapterDir)
      if (css) parts.push(css)
      style.remove()
    }
    for (const link of Array.from(
      doc.querySelectorAll('link[rel="stylesheet"]'),
    )) {
      const href = link.getAttribute("href")
      if (!href) continue
      const cssPath = resolveRelativePath(chapterDir, href)
      const cssData = this.readBinaryFile(cssPath)
      if (cssData) {
        const cssDir = getDirname(cssPath)
        const css = this.resolveCssUrls(
          new TextDecoder("utf-8").decode(cssData),
          cssDir,
        )
        if (css) parts.push(css)
      }
      link.remove()
    }
    return parts.join("\n")
  }

  private resolveImages(doc: Document, chapterDir: string): void {
    for (const img of Array.from(doc.querySelectorAll("img"))) {
      const src = img.getAttribute("src")
      if (!src || isExternalUrl(src)) continue
      const blobUrl = this.resourceBlobUrl(resolveRelativePath(chapterDir, src))
      if (blobUrl) img.setAttribute("src", blobUrl)
    }
    for (const svgImage of Array.from(doc.querySelectorAll("image"))) {
      const href =
        svgImage.getAttributeNS("http://www.w3.org/1999/xlink", "href") ||
        svgImage.getAttribute("href")
      if (!href || isExternalUrl(href)) continue
      const blobUrl = this.resourceBlobUrl(
        resolveRelativePath(chapterDir, href),
      )
      if (blobUrl) {
        svgImage.setAttribute("href", blobUrl)
        svgImage.setAttributeNS("http://www.w3.org/1999/xlink", "href", blobUrl)
      }
    }
  }

  private resolveCssUrls(css: string, baseDir: string): string {
    return css.replace(
      /url\(\s*['"]?([^'")]+)['"]?\s*\)/g,
      (match, url: string) => {
        if (isExternalUrl(url)) return match
        const resolved = this.resourceBlobUrl(resolveRelativePath(baseDir, url))
        return resolved ? `url('${resolved}')` : match
      },
    )
  }

  private resourceBlobUrl(path: string): string | null {
    const normalized = normalizePath(path)
    if (this.resourceCache.has(normalized))
      return this.resourceCache.get(normalized)!
    const data = this.readBinaryFile(normalized)
    if (!data) return null
    const url = URL.createObjectURL(
      new Blob([data.slice().buffer], { type: guessMediaType(normalized) }),
    )
    this.blobUrls.push(url)
    this.resourceCache.set(normalized, url)
    return url
  }

  private firstHeading(doc: Document): string | null {
    return (
      doc.querySelector("h1, h2, h3, h4, h5, h6")?.textContent?.trim() || null
    )
  }

  private flattenToc(items: TocItem[]): TocItem[] {
    const out: TocItem[] = []
    for (const item of items) {
      out.push(item)
      if (item.subitems?.length) out.push(...this.flattenToc(item.subitems))
    }
    return out
  }
}

/**
 * Converts ZIP entry object to normalized path map.
 */
function toFileMap(
  entries: Record<string, Uint8Array>,
): Map<string, Uint8Array> {
  const out = new Map<string, Uint8Array>()
  for (const [path, data] of Object.entries(entries)) {
    out.set(normalizePath(path), data)
  }
  return out
}

/**
 * Resolves a relative href against chapter directory.
 */
function resolveRelativePath(base: string, relative: string): string {
  if (!base) return normalizePath(relative)
  if (relative.startsWith("/")) return normalizePath(relative.substring(1))
  const parts = normalizePath(base).split("/").filter(Boolean)
  for (const seg of normalizePath(relative).split("/")) {
    if (!seg || seg === ".") continue
    if (seg === "..") parts.pop()
    else parts.push(seg)
  }
  return parts.join("/")
}

/**
 * Normalizes resource path for ZIP lookup.
 */
function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\/+/, "")
}

/**
 * Computes directory part from a normalized path.
 */
function getDirname(path: string): string {
  const idx = path.lastIndexOf("/")
  return idx >= 0 ? path.slice(0, idx) : ""
}

/**
 * Strips hash fragment from href.
 */
function stripHash(href: string): string {
  return normalizePath(href.split("#")[0] || "")
}

/**
 * Guards external/data/blob urls.
 */
function isExternalUrl(url: string): boolean {
  return /^(data:|blob:|https?:|file:|#)/i.test(url)
}

/**
 * Picks the first string value from possible metadata shapes.
 */
function pickString(value: unknown): string | undefined {
  if (typeof value === "string") return value
  if (Array.isArray(value)) {
    const hit = value.find((v) => typeof v === "string")
    return typeof hit === "string" ? hit : undefined
  }
  if (value && typeof value === "object") {
    const row = value as Record<string, unknown>
    for (const key of ["name", "value", "text"]) {
      if (typeof row[key] === "string") return row[key] as string
    }
  }
}

/**
 * Computes SHA-1 hex digest required by foliate decrypt hooks.
 */
async function computeSha1Hex(data: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-1", data)
  const bytes = new Uint8Array(hash)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
}

function guessMediaType(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() || ""
  const map: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    svg: "image/svg+xml",
    webp: "image/webp",
    css: "text/css",
    woff: "font/woff",
    woff2: "font/woff2",
    ttf: "font/ttf",
    otf: "font/otf",
  }
  return map[ext] || "application/octet-stream"
}
