import {
  getDocument,
  GlobalWorkerOptions,
  version as pdfjsVersion,
  type PDFDocumentProxy,
} from "pdfjs-dist"

import type {
  BookMetadata,
  ChapterInfo,
  ImageChapterData,
  IParser,
  ParsedBook,
  TocItem,
} from "../types"

const RENDER_SCALE = 2

/** 与 package.json 中 pdfjs-dist 版本一致 */
let workerConfigured = false

/**
 * - **Vite（桌面 my-reader）**：用 `new URL(..., import.meta.url)` 指向 `pdfjs-dist` 的 worker，
 *   由 Vite 打成独立 asset，可离线、无需 `?url`（Metro 不认 `?url`）。
 * - **Metro / Expo（my-reader-mobile）**：`import.meta.url` 下的 node_modules 路径不可靠，改用 CDN worker。
 * - **兜底**：任一侧解析失败时仍用 CDN，避免白屏。
 */
function resolvePdfWorkerSrc(): string {
  if (shouldUseCdnPdfWorker()) {
    return cdnPdfWorkerSrc()
  }
  try {
    const href = new URL(
      "../../../node_modules/pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).href
    if (href && href.length > 0) return href
  } catch {
    /* fall through */
  }
  return cdnPdfWorkerSrc()
}

function cdnPdfWorkerSrc(): string {
  return `https://unpkg.com/pdfjs-dist@${pdfjsVersion}/build/pdf.worker.min.mjs`
}

function isExpoMetroRuntime(): boolean {
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process
  return Boolean(proc?.env?.EXPO_OS)
}

/**
 * Metro 不认 `?url`；部分 expo/dom WebView 里 `process.env.EXPO_OS` 可能未注入，再检测 `globalThis.expo`。
 * 成立则走 CDN worker（需联网）。桌面 Vite 仍用相对 URL 以支持离线。
 */
function shouldUseCdnPdfWorker(): boolean {
  if (isExpoMetroRuntime()) return true
  const g = globalThis as { expo?: unknown }
  return g.expo != null
}

function ensureWorker() {
  if (workerConfigured) return
  GlobalWorkerOptions.workerSrc = resolvePdfWorkerSrc()
  console.info("[pdf-parser] worker-configured", {
    workerSrc: GlobalWorkerOptions.workerSrc,
    useCdnWorker: shouldUseCdnPdfWorker(),
    pdfjsVersion,
  })
  workerConfigured = true
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
    ensureWorker()

    console.info("[pdf-parser] parse:start", {
      byteLength: buffer.byteLength,
    })

    const data = new Uint8Array(buffer)
    this.pdfDoc = await getDocument({ data }).promise

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
