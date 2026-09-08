import { EpubNavigator, EpubPreferences } from "@readium/navigator"
import {
  type Fetcher,
  Link,
  Links,
  Locator,
  LocatorLocations,
  Manifest,
  Metadata,
  type NumberRange,
  Publication,
  Resource,
} from "@readium/shared"
import { createReaderFontInjectables } from "../src/lib/readium/readerFonts"

const chapterHref = "chapter.xhtml"
const chapterLink = new Link({
  href: chapterHref,
  type: "application/xhtml+xml",
})

const chapter = `
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="zh-CN">
  <head>
    <title>阅读排版集成测试</title>
    <style>
      body, p { font-family: serif; font-size: 12px; line-height: 1; margin: 0; }
    </style>
  </head>
  <body>
    <p id="reader-probe">
      <span id="font-size-probe" style="display: inline-block; white-space: nowrap">阅读设置应当改变正文排版</span><br />
      阅读设置应当改变正文排版。阅读设置应当改变正文排版。
    </p>
  </body>
</html>
`.trim()

class FixtureResource extends Resource {
  private readonly bytes = new TextEncoder().encode(chapter)

  async link() {
    return chapterLink
  }

  async length() {
    return this.bytes.length
  }

  async read(range?: NumberRange) {
    if (!range) return this.bytes
    return this.bytes.slice(range.start, range.endInclusive + 1)
  }

  close() {}
}

class FixtureFetcher implements Fetcher {
  links() {
    return [chapterLink]
  }

  get() {
    return new FixtureResource()
  }

  close() {}
}

type ReaderMetrics = {
  fontFamily: string
  fontProbeWidth: number
  lineHeight: number
  contentLeft: number
}

function metrics(navigator: EpubNavigator): ReaderMetrics {
  const doc = navigator._cframes[0]?.iframe.contentDocument
  const paragraph = doc?.getElementById("reader-probe")
  const fontProbe = doc?.getElementById("font-size-probe")
  if (!doc || !paragraph || !fontProbe) {
    throw new Error("Reader fixture did not render")
  }

  const paragraphStyle = getComputedStyle(paragraph)
  return {
    fontFamily: paragraphStyle.fontFamily,
    fontProbeWidth: fontProbe.getBoundingClientRect().width,
    lineHeight: Number.parseFloat(paragraphStyle.lineHeight),
    contentLeft: paragraph.getBoundingClientRect().left,
  }
}

async function settle() {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  await new Promise<void>((resolve) => window.setTimeout(resolve, 50))
}

export async function exerciseReaderPreferences() {
  const container = document.getElementById("reader-fixture")
  if (!container) throw new Error("Missing reader fixture container")

  const metadata = Metadata.deserialize({
    title: "阅读排版集成测试",
    language: ["zh-CN"],
    layout: "reflowable",
  })
  if (!metadata) throw new Error("Invalid reader fixture metadata")

  const publication = new Publication({
    manifest: new Manifest({
      metadata,
      links: new Links([
        new Link({
          href: "https://reader-fixture.invalid/manifest.json",
          type: "application/webpub+json",
          rels: new Set(["self"]),
        }),
      ]),
      readingOrder: new Links([chapterLink]),
    }),
    fetcher: new FixtureFetcher(),
  })
  const initialPosition = new Locator({
    href: chapterHref,
    type: "application/xhtml+xml",
    locations: new LocatorLocations({
      position: 1,
      progression: 0,
      totalProgression: 0,
    }),
  })
  const navigator = new EpubNavigator(
    container,
    publication,
    {
      frameLoaded: () => {},
      positionChanged: () => {},
      tap: () => true,
      click: () => true,
      zoom: () => {},
      miscPointer: () => {},
      scroll: () => {},
      customEvent: () => {},
      handleLocator: () => false,
      textSelected: () => {},
      contentProtection: () => {},
      contextMenu: () => {},
      peripheral: () => {},
    },
    [initialPosition],
    initialPosition,
    {
      preferences: {
        fontFamily: "serif",
        fontSize: 1,
        lineHeight: 1,
        pageGutter: 0,
        columnCount: 1,
      },
      defaults: {},
      injectables: createReaderFontInjectables(),
    },
  )

  try {
    await navigator.load()
    const iframe = navigator._cframes[0]?.iframe
    if (!iframe) throw new Error("Reader fixture iframe did not load")
    iframe.style.width = "900px"
    iframe.style.height = "500px"
    await navigator.resizeHandler()
    await settle()

    const baseline = metrics(navigator)

    await navigator.submitPreferences(
      new EpubPreferences({ fontFamily: "monospace" }),
    )
    await settle()
    const fontFamily = metrics(navigator)

    await navigator.submitPreferences(new EpubPreferences({ fontSize: 2 }))
    await settle()
    const fontSize = metrics(navigator)

    await navigator.submitPreferences(new EpubPreferences({ lineHeight: 2 }))
    await settle()
    const lineHeight = metrics(navigator)

    await navigator.submitPreferences(new EpubPreferences({ pageGutter: 60 }))
    await settle()
    const pageMargin = metrics(navigator)

    return { baseline, fontFamily, fontSize, lineHeight, pageMargin }
  } finally {
    await navigator.destroy()
  }
}
