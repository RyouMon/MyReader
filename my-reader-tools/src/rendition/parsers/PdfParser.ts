import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentProxy,
} from "pdfjs-dist"
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url"

import type {
  BookMetadata,
  IParser,
  ChapterInfo,
  ImageChapterData,
  ParsedBook,
  TocItem,
} from "../types"

const RENDER_SCALE = 2

let workerConfigured = false

function ensureWorker() {
  if (workerConfigured) return
  GlobalWorkerOptions.workerSrc = pdfWorkerUrl
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

    const data = new Uint8Array(buffer)
    this.pdfDoc = await getDocument({ data }).promise

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

    return {
      metadata,
      toc,
      chapters,
      layoutMode: "fixedLayout",
    }
  }

  async getChapter(index: number): Promise<ImageChapterData> {
    if (!this.pdfDoc) throw new Error("Call parse() before getChapter()")

    const page = await this.pdfDoc.getPage(index + 1)
    const viewport = page.getViewport({ scale: RENDER_SCALE })

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
      return {
        title: info.Title || undefined,
        author: info.Author || undefined,
      }
    } catch {
      return {}
    }
  }

  private async extractOutline(): Promise<TocItem[]> {
    if (!this.pdfDoc) return []
    try {
      const outline = await this.pdfDoc.getOutline()
      if (!outline) return []
      return this.walkOutline(outline)
    } catch {
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
