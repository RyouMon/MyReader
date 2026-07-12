import { convertFileSrc, isTauri } from "@tauri-apps/api/core"

interface EpubManifestItem {
  id: string
  href: string
  "media-type": string
  properties?: string
}

interface EpubSpineItem {
  idref: string
  linear?: string
}

interface EpubTocItem {
  label: string
  href: string
  children?: EpubTocItem[]
}

interface ManifestTocLink {
  href: string
  title: string
  children?: ManifestTocLink[]
}

function toFetchableUrl(path: string): string {
  if (
    path.startsWith("http://") ||
    path.startsWith("https://") ||
    path.startsWith("asset://")
  )
    return path
  if (isTauri()) return convertFileSrc(path)
  return path
}

function resolveHref(base: string, href: string): string {
  if (
    href.startsWith("http://") ||
    href.startsWith("https://") ||
    href.startsWith("asset://")
  ) {
    return href
  }
  if (!base) return href
  const baseDir = base.includes("/")
    ? base.slice(0, base.lastIndexOf("/") + 1)
    : ""
  if (href.startsWith("/")) return href
  return baseDir + href
}

/**
 * Resolve TOC targets relative to the document that declared them, matching readingOrder hrefs.
 */
function resolveTocHrefs(
  items: EpubTocItem[],
  basePath: string,
): EpubTocItem[] {
  return items.map((item) => ({
    ...item,
    href: item.href ? resolveHref(basePath, item.href) : item.href,
    children: item.children
      ? resolveTocHrefs(item.children, basePath)
      : undefined,
  }))
}

function tocItemsToManifestLinks(items: EpubTocItem[]): ManifestTocLink[] {
  return items.map((item) => ({
    href: item.href,
    title: item.label,
    ...(item.children && item.children.length > 0
      ? { children: tocItemsToManifestLinks(item.children) }
      : {}),
  }))
}

async function fetchText(path: string): Promise<string> {
  const res = await fetch(toFetchableUrl(path))
  if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`)
  return res.text()
}

async function parseXml(text: string): Promise<Document> {
  const parser = new DOMParser()
  const doc = parser.parseFromString(text, "application/xml")
  const error = doc.querySelector("parsererror")
  if (error) throw new Error(`XML parse error: ${error.textContent}`)
  return doc
}

function getElementText(el: Element | null): string | undefined {
  if (!el) return undefined
  return el.textContent?.trim() || undefined
}

function getAttr(el: Element | null, attr: string): string | undefined {
  return el?.getAttribute(attr) || undefined
}

function childElements(parent: Element | null, localName: string): Element[] {
  if (!parent) return []
  return Array.from(parent.children).filter((c) => c.localName === localName)
}

/**
 * Parse EPUB container.xml to find the OPF package path.
 */
async function findOpfPath(extractedDir: string): Promise<string> {
  const containerXml = await fetchText(`${extractedDir}/META-INF/container.xml`)
  const doc = await parseXml(containerXml)
  const rootfile = doc.querySelector(
    "rootfile[media-type='application/oebps-package+xml']",
  )
  const fullPath = rootfile?.getAttribute("full-path")
  if (!fullPath) throw new Error("No OPF rootfile found in container.xml")
  return `${extractedDir}/${fullPath}`
}

/**
 * Parse EPUB NCX file for TOC.
 */
async function parseNcx(ncxPath: string): Promise<EpubTocItem[]> {
  try {
    const text = await fetchText(ncxPath)
    const doc = await parseXml(text)
    const navMap = doc.querySelector("navMap")
    if (!navMap) return []

    const parsePoint = (point: Element): EpubTocItem => {
      const labelEl =
        point.querySelector("navLabel > text") ??
        point.querySelector("navLabel")
      const label = labelEl?.textContent?.trim() ?? ""
      const content = point.querySelector("content")
      const href = content?.getAttribute("src") ?? ""
      const children = childElements(point, "navPoint").map(parsePoint)
      return {
        label,
        href,
        children: children.length > 0 ? children : undefined,
      }
    }

    return childElements(navMap, "navPoint").map(parsePoint)
  } catch {
    return []
  }
}

/**
 * Parse EPUB Nav XHTML for TOC.
 */
async function parseNavDoc(navPath: string): Promise<EpubTocItem[]> {
  try {
    const text = await fetchText(navPath)
    const doc = new DOMParser().parseFromString(text, "application/xhtml+xml")
    const tocNav =
      doc.querySelector("nav[epub\\:type='toc'], nav[epub\\:type=\"toc\"]") ??
      doc.querySelector("nav[epub\\:type='toc']") ??
      doc.querySelector("nav")
    if (!tocNav) return []

    const parseOl = (ol: Element): EpubTocItem[] =>
      childElements(ol, "li")
        .map((li) => {
          const a = li.querySelector("a")
          const href = a?.getAttribute("href") ?? ""
          let label = a?.textContent?.trim() ?? ""
          if (!label && a) {
            label =
              a.getAttribute("title")?.trim() ||
              a.getAttribute("aria-label")?.trim() ||
              a.querySelector("img")?.getAttribute("alt")?.trim() ||
              ""
          }
          const nestedOl = li.querySelector(":scope > ol")
          const children = nestedOl ? parseOl(nestedOl) : undefined
          return { label, href, children }
        })
        .filter((item) => item.label || item.href)

    const ol = tocNav.querySelector(":scope > ol")
    return ol ? parseOl(ol) : []
  } catch {
    return []
  }
}

/**
 * Build a Readium Web Publication Manifest from an extracted EPUB directory.
 */
export async function buildReadiumManifest(
  baseUrl: string,
): Promise<{ manifest: unknown; baseUrl: string } | null> {
  try {
    const opfPath = await findOpfPath(baseUrl)
    const opfDir = opfPath.includes("/")
      ? opfPath.slice(0, opfPath.lastIndexOf("/") + 1)
      : ""
    const publicationOpfDir = opfDir.replace(`${baseUrl}/`, "")
    const opfText = await fetchText(opfPath)
    const opf = await parseXml(opfText)

    // --- Parse package manifest ---
    const manifestEl = opf.querySelector("manifest")
    const manifestItems: Map<string, EpubManifestItem> = new Map()
    for (const item of childElements(manifestEl, "item")) {
      const id = getAttr(item, "id")
      const href = getAttr(item, "href")
      const mediaType = getAttr(item, "media-type")
      if (id && href && mediaType) {
        manifestItems.set(id, {
          id,
          href,
          "media-type": mediaType,
          properties: getAttr(item, "properties") || undefined,
        })
      }
    }

    // --- Parse spine ---
    const spineEl = opf.querySelector("spine")
    const spineItems: EpubSpineItem[] = childElements(spineEl, "itemref").map(
      (item) => ({
        idref: getAttr(item, "idref") ?? "",
        linear: getAttr(item, "linear") || undefined,
      }),
    )

    // --- Build readingOrder ---
    let spineNumber = 0
    const readingOrder = spineItems
      .filter((s) => s.idref)
      .map((s) => {
        const item = manifestItems.get(s.idref)
        if (!item) return null
        spineNumber += 1
        const link: Record<string, unknown> = {
          href: resolveHref(publicationOpfDir, item.href),
          type: item["media-type"],
          // FXL navigator uses `properties.number` in `viewport.positions` to sync
          // `currentLocation` after `next()`/`prev()`; see Readium `EpubNavigator.changeResource`.
          properties: { number: spineNumber },
        }
        if (item.properties?.includes("nav")) {
          link.rel = ["contents"]
        }
        return link
      })
      .filter(Boolean)

    // --- Build resources ---
    const spineHrefs = new Set(
      spineItems.map((s) => manifestItems.get(s.idref)?.href).filter(Boolean),
    )
    const resources = Array.from(manifestItems.values())
      .filter((item) => !spineHrefs.has(item.href))
      .map((item) => ({
        href: resolveHref(publicationOpfDir, item.href),
        type: item["media-type"],
      }))

    // --- Parse metadata ---
    const metadataEl = opf.querySelector("metadata")
    if (!metadataEl) throw new Error("No metadata element found in OPF")
    const getDc = (name: string): string | undefined =>
      getElementText(
        metadataEl.querySelector(`dc\\:${name}`) ??
          metadataEl.querySelector(name),
      )
    const title = getDc("title") ?? "Untitled"
    const language = getDc("language") ?? "und"
    const identifier = getDc("identifier")
    const publisher = getDc("publisher")
    const description = getDc("description")
    const published = getDc("date")

    // --- Parse creators ---
    const authorEls = childElements(metadataEl, "dc:creator").concat(
      childElements(metadataEl, "creator"),
    )
    const authors = authorEls
      .map((el) => getElementText(el))
      .filter(Boolean) as string[]

    const contributorEls = childElements(metadataEl, "dc:contributor").concat(
      childElements(metadataEl, "contributor"),
    )
    const contributors = contributorEls
      .map((el) => getElementText(el))
      .filter(Boolean) as string[]

    // --- Parse TOC ---
    let toc: EpubTocItem[] = []

    // Try NavDoc first (EPUB 3)
    const navItem = Array.from(manifestItems.values()).find((item) =>
      item.properties?.includes("nav"),
    )
    if (navItem) {
      const navPath = resolveHref(opfDir, navItem.href)
      const tocBasePath = resolveHref(publicationOpfDir, navItem.href)
      toc = resolveTocHrefs(await parseNavDoc(navPath), tocBasePath)
    }

    // Fallback to NCX (EPUB 2)
    if (toc.length === 0) {
      const ncxItem = Array.from(manifestItems.values()).find(
        (item) => item["media-type"] === "application/x-dtbncx+xml",
      )
      if (ncxItem) {
        const ncxPath = resolveHref(opfDir, ncxItem.href)
        const tocBasePath = resolveHref(publicationOpfDir, ncxItem.href)
        toc = resolveTocHrefs(await parseNcx(ncxPath), tocBasePath)
      }
    }

    // --- Build manifest JSON ---
    const manifestJson: Record<string, unknown> = {
      "@context": "https://readium.org/webpub-manifest/context.jsonld",
      metadata: {
        title,
        language,
        ...(identifier && { identifier }),
        ...(publisher && { publisher }),
        ...(description && { description }),
        ...(published && { published }),
        ...(authors.length > 0 && {
          author: authors.length === 1 ? authors[0] : authors,
        }),
        ...(contributors.length > 0 && { contributor: contributors }),
        conformsTo: "https://readium.org/webpub-manifest/profiles/epub",
      },
      links: [
        {
          href: `${baseUrl}/manifest.json`,
          rel: "self",
          type: "application/webpub+json",
        },
      ],
      readingOrder,
      ...(resources.length > 0 && { resources }),
      ...(toc.length > 0 && {
        toc: tocItemsToManifestLinks(toc),
      }),
    }

    return { manifest: manifestJson, baseUrl }
  } catch (e) {
    console.error("Failed to build Readium manifest:", e)
    return null
  }
}
