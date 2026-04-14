import {
  EPUB,
  type EpubBookShape,
  type EpubSection,
} from "my-reader-tools/foliate-js/epub.js"
import {
  chapterPathDirname,
  decodeLinkFragment,
  isNonBookSchemeHref,
  normalizeChapterPath,
  resolveChapterRelativePath,
  stripChapterHrefHash,
} from "../utils/internalTextLink"
import type {
  BookMetadata,
  BookSource,
  ChapterInfo,
  IParser,
  ParsedBook,
  TextChapterData,
  TocItem,
} from "../types"
import { fetchBinary, fetchText, resolveRelativePath } from "../utils/pathIO"

/**
 * EPUB parser implemented on top of `foliate-js/epub.js`.
 */
export class EpubParser implements IParser {
  private extractedDirPath: string | null = null
  private foliateBook: EpubBookShape | null = null
  private chapterIndex: ChapterInfo[] = []
  private chapterCache = new Map<number, TextChapterData>()
  private resourceCache = new Map<string, string>()
  private blobUrls: string[] = []
  private titleByHref = new Map<string, string>()

  /**
   * Parses EPUB archive and builds metadata/toc/chapter descriptors.
   */
  async parse(source: BookSource): Promise<ParsedBook> {
    this.resetState()
    if (!source.extractedDirPath) {
      throw new Error(
        "EPUB parser requires `extractedDirPath`. Please use native unzip before opening.",
      )
    }
    this.extractedDirPath = source.extractedDirPath

    const foliate = new EPUB({
      loadText: async (uri: string) => this.readTextFile(uri),
      loadBlob: async (uri: string) =>
        (await this.readBinaryFile(uri)) ?? new Uint8Array(),
      getSize: () => 0,
      sha1: async (data: ArrayBuffer) => computeSha1Hex(data),
    })
    await foliate.init()
    this.foliateBook = foliate

    const toc = this.normalizeToc(foliate.toc ?? [])
    this.assignTocSpineIndices(toc)
    for (const item of this.flattenToc(toc)) {
      const href = stripChapterHrefHash(item.href)
      if (href) this.titleByHref.set(href, item.label)
    }

    this.chapterIndex = await this.buildChapterIndexWithBodyCharWeights()

    return {
      metadata: this.normalizeMetadata(foliate.metadata ?? {}),
      toc,
      chapters: this.chapterIndex,
      layoutMode: "reflowable",
    }
  }

  /**
   * 为每道 spine 解析 XHTML 并取 `body.textContent` 的 UTF-16 长度作为 {@link ChapterInfo.contentWeight}，
   * 与阅读时章内进度所用正文范围一致；`linear === 'no'` 的项权重为 0。
   */
  private async buildChapterIndexWithBodyCharWeights(): Promise<ChapterInfo[]> {
    if (!this.foliateBook) return []
    return Promise.all(
      this.foliateBook.sections.map(
        async (section: EpubSection, index: number) => {
          const href = stripChapterHrefHash(section.id)
          const title =
            this.titleByHref.get(href) ??
            this.titleByHref.get(decodeURIComponent(href)) ??
            ""
          const linearNo = section.linear === "no"
          let contentWeight = 0
          if (!linearNo) {
            try {
              const doc = await section.createDocument()
              const n = doc.body?.textContent?.length ?? 0
              contentWeight = n > 0 ? n : 0
            } catch {
              contentWeight = 0
            }
          }
          return { index, href, title, contentWeight }
        },
      ),
    )
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
    const chapterDir = chapterPathDirname(info.href)
    const cssText = await this.collectCss(doc, chapterDir)
    await this.resolveImages(doc, chapterDir)
    const bodyPlain = doc.body?.textContent ?? ""
    const text = bodyPlain.trim()
    const bodyHtml = doc.body?.innerHTML || ""
    const bodyUtf16Length = bodyPlain.length
    const title =
      info.title || this.firstHeading(doc) || "Chapter " + String(index + 1)

    const sec = section as { cfi?: unknown }
    const spinePackageCfi = typeof sec.cfi === "string" ? sec.cfi : undefined

    const chapter: TextChapterData = {
      type: "text",
      index,
      title,
      href: info.href,
      contentWeight: info.contentWeight,
      spinePackageCfi,
      bodyHtml,
      cssText,
      text,
      bodyUtf16Length,
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
    this.extractedDirPath = null
    this.foliateBook = null
    this.chapterIndex = []
    this.chapterCache.clear()
    this.resourceCache.clear()
    this.titleByHref.clear()
  }

  private async readTextFile(uri: string): Promise<string> {
    if (!this.extractedDirPath) return ""
    const path = resolveRelativePath(this.extractedDirPath, normalizeChapterPath(uri))
    try {
      return await fetchText(path)
    } catch {
      return ""
    }
  }

  private async readBinaryFile(uri: string): Promise<Uint8Array | null> {
    if (!this.extractedDirPath) return null
    const normalized = normalizeChapterPath(uri)
    const candidates =
      decodeURIComponent(uri) !== uri
        ? [normalized, normalizeChapterPath(decodeURIComponent(uri))]
        : [normalized]
    for (const candidate of candidates) {
      const path = resolveRelativePath(this.extractedDirPath, candidate)
      try {
        return await fetchBinary(path)
      } catch {
        // continue probing
      }
    }
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
          href: stripChapterHrefHash(href),
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

  private async collectCss(doc: Document, chapterDir: string): Promise<string> {
    const parts: string[] = []
    for (const style of Array.from(doc.querySelectorAll("style"))) {
      const css = await this.resolveCssUrls(style.textContent || "", chapterDir)
      if (css) parts.push(css)
      style.remove()
    }
    for (const link of Array.from(doc.querySelectorAll('link[rel="stylesheet"]'))) {
      const href = link.getAttribute("href")
      if (!href) continue
      const cssPath = resolveChapterRelativePath(chapterDir, href)
      const cssData = await this.readBinaryFile(cssPath)
      if (cssData) {
        const cssDir = chapterPathDirname(cssPath)
        const css = await this.resolveCssUrls(
          new TextDecoder("utf-8").decode(cssData),
          cssDir,
        )
        if (css) parts.push(css)
      }
      link.remove()
    }
    return parts.join("\n")
  }

  private async resolveImages(doc: Document, chapterDir: string): Promise<void> {
    for (const img of Array.from(doc.querySelectorAll("img"))) {
      const src = img.getAttribute("src")
      if (!src || isExternalUrl(src)) continue
      const blobUrl = await this.resourceBlobUrl(
        resolveChapterRelativePath(chapterDir, src),
      )
      if (blobUrl) img.setAttribute("src", blobUrl)
    }
    for (const svgImage of Array.from(doc.querySelectorAll("image"))) {
      const href =
        svgImage.getAttributeNS("http://www.w3.org/1999/xlink", "href") ||
        svgImage.getAttribute("href")
      if (!href || isExternalUrl(href)) continue
      const blobUrl = await this.resourceBlobUrl(
        resolveChapterRelativePath(chapterDir, href),
      )
      if (blobUrl) {
        svgImage.setAttribute("href", blobUrl)
        svgImage.setAttributeNS("http://www.w3.org/1999/xlink", "href", blobUrl)
      }
    }
  }

  private async resolveCssUrls(css: string, baseDir: string): Promise<string> {
    const matches = Array.from(css.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g))
    if (matches.length === 0) return css
    let out = css
    for (const match of matches) {
      const raw = match[1]
      if (!raw || isExternalUrl(raw)) continue
      const resolved = await this.resourceBlobUrl(
        resolveChapterRelativePath(baseDir, raw),
      )
      if (!resolved) continue
      out = out.replace(match[0], `url('${resolved}')`)
    }
    return out
  }

  private async resourceBlobUrl(path: string): Promise<string | null> {
    const normalized = normalizeChapterPath(path)
    if (this.resourceCache.has(normalized))
      return this.resourceCache.get(normalized)!
    const data = await this.readBinaryFile(normalized)
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

  /**
   * Resolves a raw `<a href>` from spine chapter `fromChapterIndex` to target spine index and fragment id.
   */
  resolveInternalLink(
    fromChapterIndex: number,
    rawHref: string,
  ): { chapterIndex: number; fragmentId: string | null } | null {
    if (!this.foliateBook) return null
    const trimmed = rawHref.trim()
    if (!trimmed) return null
    if (isNonBookSchemeHref(trimmed)) return null

    const info = this.chapterIndex[fromChapterIndex]
    if (!info) return null

    const hashIdx = trimmed.indexOf("#")
    const pathPart = hashIdx >= 0 ? trimmed.slice(0, hashIdx) : trimmed
    const fragment =
      hashIdx >= 0 && hashIdx < trimmed.length - 1
        ? decodeLinkFragment(trimmed.slice(hashIdx + 1))
        : null

    const manifestPath =
      !pathPart || pathPart === ""
        ? stripChapterHrefHash(info.href)
        : resolveChapterRelativePath(
            chapterPathDirname(stripChapterHrefHash(info.href)),
            pathPart,
          )

    const fullHref = fragment ? `${manifestPath}#${fragment}` : manifestPath

    let resolved = this.foliateBook.resolveHref(fullHref)
    if (
      (resolved?.index ?? -1) < 0 &&
      manifestPath !== decodeURIComponent(manifestPath)
    ) {
      const decPath = decodeURIComponent(manifestPath)
      const retry = fragment ? `${decPath}#${fragment}` : decPath
      resolved = this.foliateBook.resolveHref(retry)
    }
    const idx = resolved?.index
    if (typeof idx !== "number" || idx < 0) return null
    return { chapterIndex: idx, fragmentId: fragment }
  }
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
