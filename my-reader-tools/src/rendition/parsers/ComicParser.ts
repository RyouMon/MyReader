import { buildComicManifest } from "./comicManifest"
import type {
  BookSource,
  IParser,
  ChapterInfo,
  ImageChapterData,
  ParsedBook,
} from "../types"
import { resolveRelativePath, toFetchableUrl } from "./pathIO"

/**
 * Parser for CBZ (Comic Book ZIP) archives.
 *
 * Extracts image files from the ZIP, sorts by filename,
 * and exposes each image as a page via blob URLs.
 */
export class ComicParser implements IParser {
  private pages: { name: string; imageUrl: string }[] = []

  async parse(source: BookSource): Promise<ParsedBook> {
    this.pages = []
    const extractedDirPath = source.extractedDirPath
    const extractedEntries = source.extractedEntries
    if (!extractedDirPath || !extractedEntries?.length) {
      throw new Error(
        "CBZ parser requires `extractedDirPath` and `extractedEntries`. Please use native unzip before opening.",
      )
    }
    const manifest = buildComicManifest(extractedEntries)
    this.pages = manifest.pages.map((page) => ({
      name: page.path,
      imageUrl: toFetchableUrl(resolveRelativePath(extractedDirPath, page.path)),
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
    const img = this.pages[index]
    if (!img) throw new Error("Page index out of range: " + index)

    const page: ImageChapterData = {
      type: "image",
      index,
      title: `Page ${index + 1}`,
      href: img.name,
      contentWeight: 1,
      imageUrl: img.imageUrl,
    }

    return page
  }

  destroy(): void {
    this.pages = []
  }
}
