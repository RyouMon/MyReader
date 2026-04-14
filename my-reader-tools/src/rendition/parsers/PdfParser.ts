import type { PDFDocumentProxy } from "pdfjs-dist"

import type {
  BookMetadata,
  ChapterInfo,
  ImageChapterData,
  IParser,
  ParsedBook,
  TocItem,
} from "../types"

const RENDER_SCALE = 2

type PdfWorkerOverride = {
  workerSrc?: string
}

const pdfWorkerOverride: PdfWorkerOverride = {}
type PdfJsModule = typeof import("pdfjs-dist")
let cachedPdfJsModule: Promise<PdfJsModule> | null = null

export function configurePdfJsWorker(options: PdfWorkerOverride): void {
  pdfWorkerOverride.workerSrc = options.workerSrc
}

/** 与 package.json 中 pdfjs-dist 版本一致 */
let workerConfigured = false

/** 延迟加载 pdf.js，避免在未使用 PDF 时提前拉入依赖。 */
async function loadPdfJsModule(): Promise<PdfJsModule> {
  if (!cachedPdfJsModule) {
    cachedPdfJsModule = import("pdfjs-dist")
  }
  return cachedPdfJsModule
}

/**
 * 宿主应用可通过 `configurePdfJsWorker()` 注入最适合当前 bundler 的 worker URL。
 * 未注入时默认使用与当前 pdfjs 版本匹配的 CDN worker。
 */
function resolvePdfWorkerSrc(pdfjsVersion: string): string {
  if (pdfWorkerOverride.workerSrc && pdfWorkerOverride.workerSrc.length > 0) {
    return pdfWorkerOverride.workerSrc
  }
  return cdnPdfWorkerSrc(pdfjsVersion)
}

function cdnPdfWorkerSrc(pdfjsVersion: string): string {
  return `https://unpkg.com/pdfjs-dist@${pdfjsVersion}/build/pdf.worker.min.mjs`
}

/** 初始化 pdf.js worker，并返回已加载模块。 */
async function ensureWorker(): Promise<PdfJsModule> {
  const pdfjs = await loadPdfJsModule()
  if (workerConfigured) return pdfjs
  pdfjs.GlobalWorkerOptions.workerSrc = resolvePdfWorkerSrc(pdfjs.version)
  console.info("[pdf-parser] worker-configured", {
    workerSrc: pdfjs.GlobalWorkerOptions.workerSrc,
    pdfjsVersion: pdfjs.version,
  })
  workerConfigured = true
  return pdfjs
}

/**
 * Parser for PDF files.
 *
 * Uses pdf.js to render each page on a temporary canvas,
 * then converts it to a blob URL. Pages are rendered on-demand
 * and cached for repeated access.
 */
export class PdfParser implements IParser {
  private pdfDoc: PDFDocumentProxy | null = null
  private blobUrls: string[] = []

  async parse(buffer: ArrayBuffer): Promise<ParsedBook> {
    const pdfjs = await ensureWorker()

    console.info("[pdf-parser] parse:start", {
      byteLength: buffer.byteLength,
    })

    const data = new Uint8Array(buffer)
    this.pdfDoc = await pdfjs.getDocument({ data }).promise

    console.info("[pdf-parser] parse:document-ready", {
      numPages: this.pdfDoc.numPages,
    })

    const numPages = this.pdfDoc.numPages
    const chapters: ChapterInfo[] = Array.from(
      { length: numPages },
      (_, i) => ({
        index: i,
        title: `Page ${i + 1}`,
        href: `page${i}`,
        contentWeight: 1,
      }),
    )

    const metadata = await this.extractMetadata()
    const toc = await this.extractOutline()

    console.info("[pdf-parser] parse:summary", {
      numPages,
      metadata,
      tocCount: toc.length,
      tocPreview: toc.slice(0, 5),
    })

    return {
      metadata,
      toc,
      chapters,
      layoutMode: "fixedLayout",
    }
  }

  async getChapter(index: number): Promise<ImageChapterData> {
    if (!this.pdfDoc) throw new Error("Call parse() before getChapter()")

    console.info("[pdf-parser] get-chapter:start", {
      index,
      pageNumber: index + 1,
    })

    const page = await this.pdfDoc.getPage(index + 1)
    const viewport = page.getViewport({ scale: RENDER_SCALE })

    console.info("[pdf-parser] get-chapter:viewport", {
      index,
      width: viewport.width,
      height: viewport.height,
      scale: RENDER_SCALE,
    })

    const canvas = document.createElement("canvas")
    canvas.width = viewport.width
    canvas.height = viewport.height

    const canvasContext = canvas.getContext("2d")
    if (!canvasContext) {
      throw new Error("Cannot get canvas 2D context for PDF render")
    }
    await page.render({ canvas, canvasContext, viewport }).promise

    const blob = await canvasToBlob(canvas)
    const imageUrl = URL.createObjectURL(blob)
    this.blobUrls.push(imageUrl)

    console.info("[pdf-parser] get-chapter:image-ready", {
      index,
      blobSize: blob.size,
      imageUrlPrefix: imageUrl.slice(0, 64),
      blobUrlCount: this.blobUrls.length,
    })

    const result: ImageChapterData = {
      type: "image",
      index,
      title: `Page ${index + 1}`,
      href: `page${index}`,
      contentWeight: 1,
      imageUrl,
    }

    return result
  }

  destroy(): void {
    console.info("[pdf-parser] destroy", {
      blobUrlCount: this.blobUrls.length,
      hasPdfDoc: Boolean(this.pdfDoc),
    })
    for (const url of this.blobUrls) URL.revokeObjectURL(url)
    this.blobUrls = []
    this.pdfDoc?.destroy()
    this.pdfDoc = null
  }

  private async extractMetadata(): Promise<BookMetadata> {
    if (!this.pdfDoc) return {}
    try {
      const meta = await this.pdfDoc.getMetadata()
      const info = meta.info as Record<string, string> | undefined
      if (!info) return {}
      const metadata = {
        title: info.Title || undefined,
        author: info.Author || undefined,
      }
      console.info("[pdf-parser] metadata", metadata)
      return metadata
    } catch {
      console.warn("[pdf-parser] metadata:failed")
      return {}
    }
  }

  private async extractOutline(): Promise<TocItem[]> {
    if (!this.pdfDoc) return []
    try {
      const outline = await this.pdfDoc.getOutline()
      if (!outline) {
        console.info("[pdf-parser] outline:empty")
        return []
      }
      console.info("[pdf-parser] outline:raw", {
        itemCount: outline.length,
      })
      const toc = this.walkOutline(outline)
      console.info("[pdf-parser] outline:normalized", {
        itemCount: toc.length,
        preview: toc.slice(0, 5),
      })
      return toc
    } catch {
      console.warn("[pdf-parser] outline:failed")
      return []
    }
  }

  private walkOutline(items: OutlineItem[]): TocItem[] {
    return items.map((item, i) => ({
      label: item.title || `Section ${i + 1}`,
      href: item.dest?.toString() || "",
      index: i,
      subitems: item.items?.length ? this.walkOutline(item.items) : undefined,
    }))
  }
}

interface OutlineItem {
  title: string
  dest: unknown
  items?: OutlineItem[]
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Canvas toBlob failed")),
      "image/png",
    )
  })
}
