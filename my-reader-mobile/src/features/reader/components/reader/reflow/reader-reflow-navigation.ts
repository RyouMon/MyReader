import type { Link, Locator } from "@my-reader/readium"

import type { ReaderTocItem } from "@/src/features/reader/components/reader/types"

export function stripFragment(href: string): string {
  const i = href.indexOf("#")
  return i >= 0 ? href.slice(0, i) : href
}

export function hrefRoughlyMatches(a: string, b: string): boolean {
  if (!a || !b) return false
  const na = stripFragment(a)
  const nb = stripFragment(b)
  return na === nb || na.endsWith(nb) || nb.endsWith(na)
}

/**
 * 为目录链接在 positions 中找首个匹配 locator（用于 TOC `goTo`）。
 */
export function findLocatorForLinkHref(
  positions: Locator[],
  linkHref: string | undefined,
): Locator | undefined {
  if (!linkHref || positions.length === 0) return undefined
  return positions.find((p) => hrefRoughlyMatches(p.href, linkHref))
}

export function positionIndexForLocator(
  positions: Locator[],
  locator: Locator,
): number {
  if (positions.length === 0) return 0
  const byHref = positions.findIndex((p) =>
    hrefRoughlyMatches(p.href, locator.href),
  )
  if (byHref >= 0) return byHref
  const prog =
    locator.locations?.totalProgression ?? locator.locations?.progression
  if (prog != null && Number.isFinite(prog)) {
    return Math.max(
      0,
      Math.min(positions.length - 1, Math.round(prog * (positions.length - 1))),
    )
  }
  return 0
}

/**
 * Find a platform-native locator from positions list that matches a stored locator.
 * Uses href first (with rough matching for EPUB), then position, then progression.
 */
export function resolveNativeLocator(
  positions: Locator[],
  stored: Locator,
): Locator | undefined {
  if (positions.length === 0) return undefined
  const byHref = positions.find((p) => hrefRoughlyMatches(p.href, stored.href))
  if (byHref) return byHref
  const position = stored.locations?.position
  if (
    typeof position === "number" &&
    position >= 1 &&
    position <= positions.length
  ) {
    return positions[position - 1]
  }
  const prog =
    stored.locations?.totalProgression ?? stored.locations?.progression
  if (prog != null && Number.isFinite(prog)) {
    const idx = Math.max(
      0,
      Math.min(positions.length - 1, Math.round(prog * (positions.length - 1))),
    )
    return positions[idx]
  }
  return undefined
}

export function buildTocItemId(
  prefix: string,
  path: readonly number[],
  rawHref: string | undefined,
) {
  const pathPart = path.join(".")
  return `${prefix}-${pathPart}-${rawHref ?? "no-href"}`
}

export function linksToTocItems(
  links: Link[],
  positions: Locator[],
): ReaderTocItem[] {
  const items: ReaderTocItem[] = []
  let flatIndex = 0

  function walk(list: Link[], parentPath: number[] = []) {
    for (const [idx, link] of list.entries()) {
      const path = [...parentPath, idx]
      const href = link.href
      const locator = findLocatorForLinkHref(positions, href)
      items.push({
        id: buildTocItemId("readium", path, href),
        label: link.title ?? `Chapter ${flatIndex + 1}`,
        pageIndex: flatIndex,
        chapterIndex: flatIndex,
        href,
        locator,
      })
      flatIndex++
      if (link.children?.length) {
        walk(link.children, path)
      }
    }
  }

  walk(links)
  return items
}
