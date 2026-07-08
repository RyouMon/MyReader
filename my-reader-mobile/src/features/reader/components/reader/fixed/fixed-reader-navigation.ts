import type { Link, Locator } from "@my-reader/readium"

import type { ReaderTocItem } from "@/src/features/reader/components/reader/types"

function clampPageIndex(index: number, total: number): number {
  return Math.max(0, Math.min(total - 1, index))
}

function stripFragment(href: string): string {
  const i = href.indexOf("#")
  return i >= 0 ? href.slice(0, i) : href
}

function hrefRoughlyMatches(a: string, b: string): boolean {
  if (!a || !b) return false
  const na = stripFragment(a)
  const nb = stripFragment(b)
  return na === nb || na.endsWith(nb) || nb.endsWith(na)
}

function pageNumberFromHref(href: string | undefined): number | undefined {
  const raw = href?.match(/[#?&]page=(\d+)/)?.[1]
  if (raw == null) return undefined
  const page = Number(raw)
  return Number.isInteger(page) && page >= 1 ? page : undefined
}

function findLocatorForLinkHref(
  positions: Locator[],
  href: string | undefined,
): Locator | undefined {
  if (!href || positions.length === 0) return undefined

  const page = pageNumberFromHref(href)
  if (page != null) {
    const matchingResourcePositions = positions.filter((p) =>
      hrefRoughlyMatches(p.href, href),
    )
    const candidates =
      matchingResourcePositions.length > 0
        ? matchingResourcePositions
        : positions
    return (
      candidates.find((p) => p.locations?.position === page) ??
      candidates[page - 1]
    )
  }

  return positions.find((p) => hrefRoughlyMatches(p.href, href))
}

function buildTocItemId(prefix: string, path: readonly number[]) {
  return `${prefix}-${path.join(".")}`
}

export function hasTocTitle(links: Link[]): boolean {
  return links.some(
    (link) => Boolean(link.title?.trim()) || hasTocTitle(link.children ?? []),
  )
}

export function linksToFixedTocItems(
  links: Link[],
  positions: Locator[],
  fallbackLabel: (index: number) => string,
): ReaderTocItem[] {
  const items: ReaderTocItem[] = []
  let flatIndex = 0

  function walk(list: Link[], parentPath: number[] = []) {
    for (const [idx, link] of list.entries()) {
      const path = [...parentPath, idx]
      const locator = findLocatorForLinkHref(positions, link.href)
      items.push({
        id: buildTocItemId("pdf-toc", path),
        label: link.title?.trim() || fallbackLabel(flatIndex),
        depth: parentPath.length,
        pageIndex: flatIndex,
        chapterIndex: flatIndex,
        href: link.href,
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

function tocItemPositionIndex(
  item: ReaderTocItem,
  positions: Locator[],
): number | undefined {
  const locator =
    item.locator ??
    (item.href ? findLocatorForLinkHref(positions, item.href) : undefined)
  if (!locator) return undefined
  return positionIndexForLocator(positions, locator)
}

export function chapterTitleForFixedLocator(
  tocItems: ReaderTocItem[],
  positions: Locator[],
  locator: Locator,
): string | undefined {
  if (tocItems.length === 0) return undefined

  const currentIndex = positionIndexForLocator(positions, locator)
  return tocItems
    .map((item) => ({
      item,
      index: tocItemPositionIndex(item, positions),
    }))
    .filter(
      (entry): entry is { item: ReaderTocItem; index: number } =>
        entry.index != null && entry.index <= currentIndex,
    )
    .sort((a, b) => b.index - a.index)[0]?.item.label
}

export function positionIndexForLocator(
  positions: Locator[],
  locator: Locator,
): number {
  if (positions.length === 0) return 0

  const position = locator.locations?.position
  if (typeof position === "number" && position >= 1) {
    return clampPageIndex(position - 1, positions.length)
  }

  const prog =
    locator.locations?.totalProgression ?? locator.locations?.progression
  const matchingHrefCount = positions.filter(
    (p) => p.href === locator.href,
  ).length
  if (matchingHrefCount > 1 && prog != null && Number.isFinite(prog)) {
    return clampPageIndex(
      Math.round(prog * (positions.length - 1)),
      positions.length,
    )
  }

  const byHref = positions.findIndex((p) => p.href === locator.href)
  if (byHref >= 0) return byHref

  if (prog != null && Number.isFinite(prog)) {
    return clampPageIndex(
      Math.round(prog * (positions.length - 1)),
      positions.length,
    )
  }

  return 0
}

/**
 * Find a platform-native locator from positions list that matches a stored locator.
 * Uses position first, then href, then progression so the returned locator has a
 * href that matches the native publication format.
 */
export function resolveNativeLocator(
  positions: Locator[],
  stored: Locator,
): Locator | undefined {
  if (positions.length === 0) return undefined

  const position = stored.locations?.position
  if (
    typeof position === "number" &&
    position >= 1 &&
    position <= positions.length
  ) {
    return positions[position - 1]
  }

  const byHref = positions.find((p) => p.href === stored.href)
  if (byHref) return byHref

  const prog =
    stored.locations?.totalProgression ?? stored.locations?.progression
  if (prog != null && Number.isFinite(prog)) {
    const index = clampPageIndex(
      Math.round(prog * (positions.length - 1)),
      positions.length,
    )
    return positions[index]
  }

  return undefined
}
