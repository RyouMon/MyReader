import { unzipSync } from "fflate"

import { buildComicManifest } from "./comicManifest"
import type {
  IParser,
  ChapterInfo,
  ImageChapterData,
  ParsedBook,
} from "../types"

/**
 * Parser for CBZ (Comic Book ZIP) archives.
 *
 * Extracts image files from the ZIP, sorts by filename,
 * and exposes each image as a page via blob URLs.
 */
export class ComicParser implements IParser {
  private images: { name: string; data: Uint8Array }[] = []
  private blobUrls: string[] = []

  async parse(buffer: ArrayBuffer): Promise<ParsedBook> {
    const raw = new Uint8Array(buffer)
    if (raw.length < 4 || raw[0] !== 0x50 || raw[1] !== 0x4b) {
      throw new Error(
        "漫画文件不是 ZIP 格式。CBR（RAR）暂不支持，请在 Calibre 中转为 CBZ 后阅读。",
      )
    }

    const files = unzipSync(raw)
    const manifest = buildComicManifest(Object.keys(files))

    this.images = manifest.pages.map((page) => ({
      name: page.path,
      data: files[page.path]!.slice(),
    }))

    const chapters: ChapterInfo[] = manifest.pages.map((page) => ({
      index: page.index,
      title: page.title,
      href: page.path,
      contentWeight: page.contentWeight,
    }))

    return {
      metadata: {},
      toc: manifest.toc,
      chapters,
      layoutMode: "fixedLayout",
    }
  }

  async getChapter(index: number): Promise<ImageChapterData> {
    const img = this.images[index]
    if (!img) throw new Error("Page index out of range: " + index)

    const mime = guessImageMime(img.name)
    const bytes = img.data.slice()
    const imageUrl = objectUrlOrDataUriForImage(bytes, mime, this.blobUrls)

    const page: ImageChapterData = {
      type: "image",
      index,
      title: `Page ${index + 1}`,
      href: img.name,
      contentWeight: 1,
      imageUrl,
    }

    return page
  }

  destroy(): void {
    for (const url of this.blobUrls) URL.revokeObjectURL(url)
    this.blobUrls = []
    this.images = []
  }
}

/**
 * Web / Tauri: blob URLs are efficient. React Native Hermes rejects
 * `new Blob([ArrayBuffer|ArrayBufferView])` — fall back to a data URI.
 */
function objectUrlOrDataUriForImage(
  bytes: Uint8Array,
  mime: string,
  blobUrls: string[],
): string {
  try {
    const blob = new Blob([new Uint8Array(bytes)], { type: mime })
    const url = URL.createObjectURL(blob)
    blobUrls.push(url)
    return url
  } catch {
    return `data:${mime};base64,${uint8ToBase64(bytes)}`
  }
}

function uint8ToBase64(bytes: Uint8Array): string {
  const g = globalThis as typeof globalThis & {
    Buffer?: {
      from(
        data: Uint8Array,
      ): { toString(encoding: "base64"): string }
    }
  }
  if (g.Buffer?.from) {
    return g.Buffer.from(bytes).toString("base64")
  }
  const btoaFn = globalThis.btoa as ((s: string) => string) | undefined
  if (typeof btoaFn === "function") {
    let binary = ""
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]!)
    }
    return btoaFn(binary)
  }
  throw new Error("无法将漫画页编码为 Base64（缺少 btoa / Buffer）")
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
