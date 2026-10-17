import type { ReaderImageSource } from "@/types/reader"
import type { PdfNavigator } from "./readium/PdfNavigator"
import {
  readerImageFileName,
  type ReaderImageBook,
} from "@my-reader/tools/reader-image-export"

export function divinaPageImages(
  items: readonly { href: string }[],
  pages: readonly number[],
): ReaderImageSource[] {
  return pages.map((page) => {
    const item = items[page - 1]
    if (!item) throw new Error("READER_NOT_READY")
    return { url: item.href, position: page }
  })
}

export async function pdfPageImages(
  navigator: Pick<PdfNavigator, "renderSinglePage">,
  container: HTMLElement,
  spread: readonly number[] | null,
): Promise<ReaderImageSource[]> {
  const viewport = container.getBoundingClientRect()
  const pages =
    spread ??
    Array.from(
      container.querySelectorAll<HTMLCanvasElement>("canvas[data-pdf-page]"),
    )
      .filter((canvas) => {
        const rect = canvas.getBoundingClientRect()
        return rect.bottom > viewport.top && rect.top < viewport.bottom
      })
      .map((canvas) => Number(canvas.dataset.pdfPage))
  const images: ReaderImageSource[] = []
  for (const page of pages) {
    const canvas = document.createElement("canvas")
    await navigator.renderSinglePage(
      canvas,
      page,
      container.clientWidth / pages.length,
      container.clientHeight,
    )
    images.push({
      name: "page.png",
      position: page,
      data: canvas.toDataURL("image/png").split(",")[1],
    })
  }
  return images
}

export async function readerImagePayload(
  source: ReaderImageSource,
  book: ReaderImageBook,
) {
  const fileName = (name: string, mimeType?: string) =>
    readerImageFileName(book, source.position ?? 1, name, mimeType)
  if ("capture" in source)
    return { name: fileName(source.name), data: null, capture: source.capture }
  if ("data" in source)
    return { name: fileName(source.name), data: source.data, capture: null }
  const response = await fetch(source.url)
  if (!response.ok) throw new Error(`IMAGE_READ_FAILED: ${response.status}`)
  const blob = await response.blob()
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error)
    reader.onload = () => resolve(String(reader.result).split(",")[1])
    reader.readAsDataURL(blob)
  })
  const url = new URL(source.url, document.baseURI)
  const resourceName =
    url.protocol === "blob:" || url.protocol === "data:"
      ? ""
      : decodeURIComponent(url.pathname.split("/").pop() || "image")
  const name = fileName(source.name ?? resourceName, blob.type)
  return { name, data, capture: null }
}

/** PDF.js renders opaque pages; transparent outer padding comes from outside the CropBox. */
function pdfImageData(image: HTMLCanvasElement): string {
  const { width, height } = image
  const pixels = image.getContext("2d")!.getImageData(0, 0, width, height).data
  let left = width
  let top = height
  let right = -1
  let bottom = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (pixels[(y * width + x) * 4 + 3] === 0) continue
      left = Math.min(left, x)
      top = Math.min(top, y)
      right = Math.max(right, x)
      bottom = Math.max(bottom, y)
    }
  }
  if (
    right < left ||
    (left === 0 && top === 0 && right === width - 1 && bottom === height - 1)
  )
    return image.toDataURL("image/png").split(",")[1]
  const cropped = image.ownerDocument.createElement("canvas")
  cropped.width = right - left + 1
  cropped.height = bottom - top + 1
  cropped.getContext("2d")!.drawImage(image, -left, -top)
  return cropped.toDataURL("image/png").split(",")[1]
}

export function imageSourceAtEvent(
  event: MouseEvent,
): ReaderImageSource | null {
  const target = event.target as Element | null
  const image = target?.closest?.("img, svg image, .textLayerImages canvas")
  if (!image) return null
  const page =
    image.closest<HTMLElement>("[data-reader-page]")?.dataset.readerPage
  const position = page ? Number(page) : undefined
  if (image.tagName.toLowerCase() === "canvas") {
    return {
      name: "image.png",
      position,
      data: pdfImageData(image as HTMLCanvasElement),
    }
  }
  const src =
    (image as HTMLImageElement).currentSrc ||
    image.getAttribute("src") ||
    image.getAttribute("href") ||
    image.getAttribute("xlink:href")
  return src ? { url: new URL(src, image.baseURI).href, position } : null
}

/** Capture each rendered EPUB page, excluding preloaded/offscreen frames. */
export function epubPageImages(
  container: HTMLElement,
  start: number,
  end: number,
): ReaderImageSource[] {
  const viewport = container.getBoundingClientRect()
  const captures: { x: number; y: number; width: number; height: number }[] = []
  let rtl = false
  for (const frame of container.querySelectorAll("iframe")) {
    const rect = frame.getBoundingClientRect()
    const x = Math.max(rect.left, viewport.left)
    const y = Math.max(rect.top, viewport.top)
    const width = Math.min(rect.right, viewport.right) - x
    const height = Math.min(rect.bottom, viewport.bottom) - y
    if (
      width <= 1 ||
      height <= 1 ||
      getComputedStyle(frame).visibility === "hidden"
    )
      continue
    const doc = frame.contentDocument
    const style = doc?.defaultView?.getComputedStyle(doc.documentElement)
    const columns = Math.max(
      1,
      Math.min(2, Number(style?.getPropertyValue("--RS__colCount")) || 1),
    )
    rtl = style?.direction === "rtl"
    for (let column = 0; column < columns; column++) {
      captures.push({
        x: x + (width * column) / columns,
        y,
        width: width / columns,
        height,
      })
    }
  }
  if (!captures.length) throw new Error("READER_NOT_READY")
  captures.sort((a, b) => (rtl ? b.x - a.x : a.x - b.x))
  return captures.map((capture, index) => ({
    name: "page.png",
    position: Math.min(
      end,
      start + Math.floor(((end - start + 1) * index) / captures.length),
    ),
    capture,
  }))
}
