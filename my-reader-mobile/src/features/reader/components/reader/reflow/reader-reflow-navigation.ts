import type { Link, Locator, Utterance } from "@my-reader/readium"

import type { ReaderTocItem } from "@/src/features/reader/components/reader/types"
import {
  fragmentFromHref,
  hasFragment,
  hrefRoughlyMatches,
  locatorWithHrefFragments,
} from "@/src/features/reader/components/reader/reader-toc-resolver"

const MIN_PARTIAL_HEADING_MATCH_LENGTH = 8

function normalizedText(text: string | undefined): string {
  return text?.replace(/\s+/g, "").trim() ?? ""
}

function headingTextMatches(utteranceText: string, itemText: string): boolean {
  if (!utteranceText || !itemText) return false
  if (utteranceText.startsWith(itemText)) return true
  return (
    utteranceText.length >= MIN_PARTIAL_HEADING_MATCH_LENGTH &&
    itemText.startsWith(utteranceText)
  )
}

function locatorWithTocHref(locator: Locator, item: ReaderTocItem): Locator {
  if (!item.href) {
    return {
      ...locator,
      title: item.label,
    }
  }

  const fragment = fragmentFromHref(item.href)
  const fragments = locator.locations?.fragments ?? []
  const locations: NonNullable<Locator["locations"]> = {
    progression: locator.locations?.progression ?? 0,
  }
  if (locator.locations?.position != null) {
    locations.position = locator.locations.position
  }
  if (locator.locations?.totalProgression != null) {
    locations.totalProgression = locator.locations.totalProgression
  }
  if (fragments.length > 0 || fragment) {
    locations.fragments =
      fragment && !fragments.includes(fragment)
        ? [...fragments, fragment]
        : fragments
  }

  return {
    ...locator,
    href: item.href,
    title: item.label,
    locations,
  }
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

export function locatorForTocLink(
  link: Link,
  positions: Locator[],
): Locator | undefined {
  const href = link.href
  if (!href) return undefined

  const baseLocator = findLocatorForLinkHref(positions, href)
  if (!hasFragment(href)) return baseLocator

  const locations: NonNullable<Locator["locations"]> = {
    progression: baseLocator?.locations?.progression ?? 0,
  }
  const position = baseLocator?.locations?.position
  if (position != null) {
    locations.position = position
  }
  const totalProgression = baseLocator?.locations?.totalProgression
  if (totalProgression != null) {
    locations.totalProgression = totalProgression
  }

  return {
    href,
    type: baseLocator?.type ?? "application/xhtml+xml",
    title: link.title,
    locations,
  }
}

export function locatorWithTocSelection(
  locator: Locator,
  selectedTocItem: ReaderTocItem | null,
): Locator {
  const locatorWithFragments = locatorWithHrefFragments(locator)
  if (locatorWithFragments !== locator) return locatorWithFragments

  if (
    selectedTocItem?.href == null ||
    !hrefRoughlyMatches(locatorWithFragments.href, selectedTocItem.href)
  ) {
    return locatorWithFragments
  }

  return {
    ...locatorWithFragments,
    href: selectedTocItem.href,
    title: selectedTocItem.label,
  }
}

export function enhanceTocItemsWithContentLocators(
  tocItems: ReaderTocItem[],
  utterances: Utterance[],
): ReaderTocItem[] {
  if (tocItems.length === 0 || utterances.length === 0) return tocItems

  let changed = false
  const enhanced = tocItems.map((item) => {
    const itemText = normalizedText(item.label)
    if (!itemText || !item.href) return item
    const itemHref = item.href

    const match = utterances.find((utterance) => {
      const utteranceText = normalizedText(utterance.text)
      return (
        headingTextMatches(utteranceText, itemText) &&
        hrefRoughlyMatches(utterance.locator.href, itemHref)
      )
    })
    if (!match) return item

    const locator = locatorWithTocHref(match.locator, item)
    changed = true
    return {
      ...item,
      locator,
      locatorSource: "content" as const,
    }
  })

  return changed ? enhanced : tocItems
}

function locatorPositionMatchesTotalProgression(
  positions: Locator[],
  locator: Locator,
): boolean {
  const position = locator.locations?.position
  const totalProgression = locator.locations?.totalProgression
  if (
    typeof position !== "number" ||
    position < 1 ||
    typeof totalProgression !== "number" ||
    !Number.isFinite(totalProgression)
  ) {
    return false
  }

  const indexFromProgression = Math.round(
    totalProgression * (positions.length - 1),
  )
  return Math.abs(indexFromProgression - (position - 1)) <= 1
}

/**
 * Find a platform-native locator from positions list that matches a stored locator.
 * Uses stored position first when it still points at the same resource. This
 * keeps same-XHTML subchapters from snapping back to the resource's first page.
 */
export function resolveNativeLocator(
  positions: Locator[],
  stored: Locator,
): Locator | undefined {
  if (positions.length === 0) return undefined
  const position = stored.locations?.position
  let byPosition: Locator | undefined
  if (
    typeof position === "number" &&
    position >= 1 &&
    position <= positions.length
  ) {
    const candidate = positions[position - 1]
    if (candidate) {
      byPosition = candidate
      if (hrefRoughlyMatches(byPosition.href, stored.href)) return byPosition
      if (locatorPositionMatchesTotalProgression(positions, stored)) {
        return byPosition
      }
    }
  }
  const byHref = positions.find((p) => hrefRoughlyMatches(p.href, stored.href))
  if (byHref) return byHref
  if (byPosition) return byPosition
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
      const locator = locatorForTocLink(link, positions)
      items.push({
        id: buildTocItemId("readium", path, href),
        label: link.title ?? `Chapter ${flatIndex + 1}`,
        depth: parentPath.length,
        pageIndex: flatIndex,
        chapterIndex: flatIndex,
        href,
        locator,
        locatorSource:
          locator && hasFragment(href) ? ("resource" as const) : undefined,
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
