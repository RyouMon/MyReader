const IMAGE_EXT = /\.(jpe?g|png|gif|webp|avif|bmp)$/i

function isImagePath(rel: string): boolean {
  return IMAGE_EXT.test(rel.replace(/\\/g, "/"))
}

function directoryUrlWithSlash(dirUrl: string): string {
  return dirUrl.replace(/\/?$/, "/")
}

/**
 * Encode each path segment for use in a URL path (ZIP names may contain spaces, `#`, etc.).
 */
function toAbsoluteResourceUrl(baseDirUrl: string, relativePath: string): string {
  const base = directoryUrlWithSlash(baseDirUrl)
  const encodedPath = relativePath
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean)
    .map((seg) => encodeURIComponent(seg))
    .join("/")
  return new URL(encodedPath, base).href
}

/**
 * Build a DIVINA-profile Web Pub manifest from extracted archive member paths (ZIP order → sort).
 *
 * `contentBaseUrl` must be the extracted **directory** URL (e.g. Tauri `convertFileSrc` of the
 * cache folder). Reading-order `href`s are absolute HTTPS asset URLs so FXL blob frames can
 * load images under the app’s secure context (plain `http://127.0.0.1` streamer URLs are blocked
 * as mixed content inside Readium’s blob HTML wrapper).
 */
export function buildDivinaManifestJson(params: {
  contentBaseUrl: string
  title: string
  relativePaths: string[]
}): Record<string, unknown> | null {
  const { contentBaseUrl, title, relativePaths } = params
  const pages = relativePaths
    .filter((p) => {
      const n = p.replace(/\\/g, "/").split("/").pop() ?? ""
      if (n.startsWith(".") || n === "") return false
      return isImagePath(p)
    })
    .map((p) => p.replace(/\\/g, "/"))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }))

  if (pages.length === 0) return null

  const base = directoryUrlWithSlash(contentBaseUrl)
  const selfHref = new URL("manifest.webpub.json", base).href

  const readingOrder = pages.map((rel, i) => {
    const absHref = toAbsoluteResourceUrl(base, rel)
    const lower = rel.toLowerCase()
    let type = "image/jpeg"
    if (lower.endsWith(".png")) type = "image/png"
    else if (lower.endsWith(".gif")) type = "image/gif"
    else if (lower.endsWith(".webp")) type = "image/webp"
    else if (lower.endsWith(".avif")) type = "image/avif"
    else if (lower.endsWith(".bmp")) type = "image/bmp"
    // FXL `EpubNavigator.changeResource` compares `viewport.positions` from
    // `link.properties.number`; without it, `currentLocation` never updates and
    // `apply()` resyncs the slide back to the previous page.
    return { href: absHref, type, properties: { number: i + 1 } }
  })

  return {
    "@context": "https://readium.org/webpub-manifest/context.jsonld",
    metadata: {
      title,
      "@type": "https://schema.org/ComicIssue",
      conformsTo: "https://readium.org/webpub-manifest/profiles/divina",
      readingProgression: "ltr",
    },
    links: [
      {
        href: selfHref,
        rel: "self",
        type: "application/webpub+json",
      },
    ],
    readingOrder,
  }
}
