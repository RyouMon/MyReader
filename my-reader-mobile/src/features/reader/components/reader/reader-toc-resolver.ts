import type { Locator } from "@my-reader/readium"

import type { ReaderTocItem } from "@/src/features/reader/components/reader/types"

export type ReaderTocResolutionReason =
  | "selected"
  | "exact-fragment"
  | "exact-position"
  | "resource-position"
  | "resource-start"
  | "progression"
  | "title"
  | "closest-before"
  | "href"
  | "fallback"
  | "none"

export type ReaderTocResolution = {
  index: number
  item: ReaderTocItem | null
  title: string | null
  currentPage: number | null
  reason: ReaderTocResolutionReason
}

export type ResolveReaderTocInput = {
  toc: ReaderTocItem[]
  positions?: Locator[]
  locator?: Locator | null
  currentHref?: string | null
  currentPage?: number | null
  currentTitle?: string | null
  selectedTocItem?: ReaderTocItem | null
  fallbackTitle?: string | null
}

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

export function hasFragment(href: string | undefined): boolean {
  return href?.includes("#") ?? false
}

export function fragmentFromHref(href: string | undefined): string | undefined {
  const i = href?.indexOf("#") ?? -1
  if (!href || i < 0) return undefined
  return href.slice(i + 1)
}

export function locatorWithHrefFragments(locator: Locator): Locator {
  if (hasFragment(locator.href)) return locator

  const fragment = locator.locations?.fragments?.find(Boolean)
  if (!fragment) return locator

  const normalizedFragment = fragment.startsWith("#")
    ? fragment.slice(1)
    : fragment
  if (!normalizedFragment) return locator

  return {
    ...locator,
    href: `${locator.href}#${normalizedFragment}`,
  }
}

export function positionIndexForLocator(
  positions: Locator[] | undefined,
  locator: Locator,
): number {
  const position = locator.locations?.position
  if (typeof position === "number" && position >= 1) {
    return clampPositionIndex(position - 1, positions?.length ?? position)
  }

  if (positions == null || positions.length === 0) return 0

  const byHref = positions.findIndex((p) =>
    hrefRoughlyMatches(p.href, locator.href),
  )
  if (byHref >= 0) return byHref

  const progression =
    locator.locations?.totalProgression ?? locator.locations?.progression
  if (progression != null && Number.isFinite(progression)) {
    return clampPositionIndex(
      Math.round(progression * (positions.length - 1)),
      positions.length,
    )
  }
  return 0
}

export function resolveReaderToc({
  toc,
  positions,
  locator,
  currentHref,
  currentPage,
  currentTitle,
  selectedTocItem,
  fallbackTitle,
}: ResolveReaderTocInput): ReaderTocResolution {
  const locatorWithFragments = locator
    ? locatorWithHrefFragments(locator)
    : undefined
  const href = locatorWithFragments?.href ?? currentHref ?? null
  const page =
    typeof currentPage === "number" && Number.isFinite(currentPage)
      ? currentPage
      : locatorWithFragments
        ? positionIndexForLocator(positions, locatorWithFragments)
        : null
  const progression = locatorProgression(locatorWithFragments)

  if (toc.length === 0) {
    return emptyResolution(page, fallbackTitle ?? currentTitle ?? null)
  }

  const selectedIndex = selectedTocItem
    ? toc.findIndex((item) => item.id === selectedTocItem.id)
    : -1
  if (
    selectedIndex >= 0 &&
    tocItemCanRepresentHref(toc[selectedIndex]!, href)
  ) {
    return itemResolution(toc, selectedIndex, page, "selected")
  }

  if (href != null && (hasFragment(href) || page == null)) {
    const exactIndex = exactHrefIndex(toc, href)
    if (
      exactIndex >= 0 &&
      tocItemHasStarted(toc[exactIndex]!, positions, page)
    ) {
      return itemResolution(toc, exactIndex, page, "exact-fragment")
    }
  }

  if (href != null && !hasFragment(href) && page != null) {
    const exactIndex = exactHrefIndex(toc, href)
    const exactItem = exactIndex >= 0 ? toc[exactIndex] : undefined
    const positionItemIndex = positionHrefIndex(toc, positions, page)
    const closestBeforeIndex = closestBeforePositionIndex(toc, positions, page)
    if (
      positionItemIndex >= 0 &&
      exactIndex >= 0 &&
      positionItemIndex > exactIndex
    ) {
      return itemResolution(toc, positionItemIndex, page, "resource-position")
    }

    if (exactItem && tocItemPositionIndex(exactItem, positions) === page) {
      return itemResolution(toc, exactIndex, page, "exact-position")
    }

    if (
      exactItem &&
      (closestBeforeIndex < 0 || closestBeforeIndex <= exactIndex) &&
      progression != null &&
      !hasStartedNestedTocItem(toc, positions, exactItem, href, progression)
    ) {
      return itemResolution(toc, exactIndex, page, "resource-start")
    }

    if (exactItem && progression == null) {
      const nestedStarted = toc.some(
        (item) =>
          item !== exactItem &&
          item.href != null &&
          hasFragment(item.href) &&
          hrefRoughlyMatches(href, item.href) &&
          tocItemPositionIndex(item, positions) != null &&
          tocItemPositionIndex(item, positions)! <= page,
      )
      if (!nestedStarted) {
        if (closestBeforeIndex < 0 || closestBeforeIndex <= exactIndex) {
          return itemResolution(toc, exactIndex, page, "resource-start")
        }
      }
    }
  }

  if (href != null && progression != null && !hasFragment(href)) {
    const closestByProgression = closestProgressionIndex(
      toc,
      positions,
      href,
      progression,
    )
    if (closestByProgression >= 0) {
      return itemResolution(toc, closestByProgression, page, "progression")
    }
  }

  const closestBeforeIndex =
    page == null ? -1 : closestBeforePositionIndex(toc, positions, page)
  const titleIndex = currentTitle
    ? titleTocIndex(toc, positions, page, currentTitle, closestBeforeIndex)
    : -1
  if (titleIndex >= 0) {
    return itemResolution(toc, titleIndex, page, "title")
  }

  if (closestBeforeIndex >= 0) {
    return itemResolution(toc, closestBeforeIndex, page, "closest-before")
  }

  if (href != null) {
    const hrefIndex = toc.findIndex(
      (item) => item.href != null && hrefRoughlyMatches(href, item.href),
    )
    if (hrefIndex >= 0) {
      return itemResolution(toc, hrefIndex, page, "href")
    }
  }

  return emptyResolution(page, fallbackTitle ?? currentTitle ?? null)
}

function hrefExactlyMatches(a: string, b: string): boolean {
  if (!a || !b) return false
  return a === b || a.endsWith(b) || b.endsWith(a)
}

function exactHrefIndex(toc: ReaderTocItem[], href: string): number {
  return (
    toc
      .map((item, index) => ({ item, index }))
      .filter(
        (
          entry,
        ): entry is {
          item: ReaderTocItem
          index: number
        } =>
          entry.item.href != null && hrefExactlyMatches(href, entry.item.href),
      )
      .sort(
        (a, b) =>
          (b.item.depth ?? 0) - (a.item.depth ?? 0) || b.index - a.index,
      )[0]?.index ?? -1
  )
}

function clampPositionIndex(index: number, total: number): number {
  return Math.max(0, Math.min(total - 1, index))
}

function emptyResolution(
  currentPage: number | null,
  fallbackTitle: string | null,
): ReaderTocResolution {
  const title = fallbackTitle?.trim() || null
  return {
    index: -1,
    item: null,
    title,
    currentPage,
    reason: title ? "fallback" : "none",
  }
}

function itemResolution(
  toc: ReaderTocItem[],
  index: number,
  currentPage: number | null,
  reason: ReaderTocResolutionReason,
): ReaderTocResolution {
  const item = toc[index]!
  return {
    index,
    item,
    title: item.label,
    currentPage,
    reason,
  }
}

function tocItemCanRepresentHref(
  item: ReaderTocItem,
  href: string | null,
): boolean {
  return (
    item.href == null || href == null || hrefRoughlyMatches(href, item.href)
  )
}

function locatorProgression(locator: Locator | undefined): number | undefined {
  const progression = locator?.locations?.progression
  return typeof progression === "number" && Number.isFinite(progression)
    ? progression
    : undefined
}

function tocItemLocator(
  item: ReaderTocItem,
  positions: Locator[] | undefined,
): Locator | undefined {
  if (item.locator && !locatorOnlyTargetsResourceStart(item)) {
    return item.locator
  }

  if (!item.href || !positions) return undefined

  if (hasFragment(item.href)) {
    return positions.find((p) => hrefExactlyMatches(p.href, item.href!))
  }

  return positions.find((p) => hrefRoughlyMatches(p.href, item.href!))
}

function locatorOnlyTargetsResourceStart(item: ReaderTocItem): boolean {
  return item.locatorSource === "resource" && hasFragment(item.href)
}

function tocItemPositionIndex(
  item: ReaderTocItem,
  positions: Locator[] | undefined,
): number | undefined {
  const locator = tocItemLocator(item, positions)
  if (!locator) return undefined

  if (positions != null && positions.length > 0) {
    return positionIndexForLocator(positions, locator)
  }

  const position = locator.locations?.position
  return typeof position === "number" && position >= 1
    ? position - 1
    : undefined
}

function tocItemHasStarted(
  item: ReaderTocItem,
  positions: Locator[] | undefined,
  currentPage: number | null,
): boolean {
  if (currentPage == null) return true
  const positionIndex = tocItemPositionIndex(item, positions)
  return positionIndex == null || positionIndex <= currentPage
}

function positionHrefIndex(
  toc: ReaderTocItem[],
  positions: Locator[] | undefined,
  currentPage: number,
): number {
  const positionLocator = positions?.[currentPage]
  if (!positionLocator) return -1
  return exactHrefIndex(toc, positionLocator.href)
}

function hasStartedNestedTocItem(
  toc: ReaderTocItem[],
  positions: Locator[] | undefined,
  parentItem: ReaderTocItem,
  currentHref: string,
  currentProgression: number,
): boolean {
  return toc.some((item) => {
    if (
      item === parentItem ||
      item.href == null ||
      !hasFragment(item.href) ||
      !hrefRoughlyMatches(currentHref, item.href)
    ) {
      return false
    }

    const progression = locatorProgression(tocItemLocator(item, positions))
    return progression != null && progression <= currentProgression
  })
}

function closestProgressionIndex(
  toc: ReaderTocItem[],
  positions: Locator[] | undefined,
  currentHref: string,
  currentProgression: number,
): number {
  return (
    toc
      .map((item, index) => {
        const locator = tocItemLocator(item, positions)
        return {
          item,
          index,
          progression: locatorProgression(locator),
        }
      })
      .filter(
        (
          entry,
        ): entry is {
          item: ReaderTocItem
          index: number
          progression: number
        } => {
          return (
            entry.item.href != null &&
            hrefRoughlyMatches(currentHref, entry.item.href) &&
            entry.progression != null &&
            entry.progression <= currentProgression
          )
        },
      )
      .sort((a, b) => {
        return (
          b.progression - a.progression ||
          (b.item.depth ?? 0) - (a.item.depth ?? 0) ||
          b.index - a.index
        )
      })[0]?.index ?? -1
  )
}

function closestBeforePositionIndex(
  toc: ReaderTocItem[],
  positions: Locator[] | undefined,
  currentPage: number,
): number {
  return (
    toc
      .map((item, index) => ({
        item,
        index,
        positionIndex: tocItemPositionIndex(item, positions),
      }))
      .filter(
        (
          entry,
        ): entry is {
          item: ReaderTocItem
          index: number
          positionIndex: number
        } => entry.positionIndex != null && entry.positionIndex <= currentPage,
      )
      .sort(
        (a, b) =>
          b.positionIndex - a.positionIndex ||
          (b.item.depth ?? 0) - (a.item.depth ?? 0) ||
          b.index - a.index,
      )[0]?.index ?? -1
  )
}

function titleTocIndex(
  toc: ReaderTocItem[],
  positions: Locator[] | undefined,
  currentPage: number | null,
  currentTitle: string,
  closestBeforeIndex: number,
): number {
  const title = normalizedTitle(currentTitle)
  if (!title) return -1

  const titleIndex = toc.findIndex(
    (item) => normalizedTitle(item.label) === title,
  )
  if (titleIndex < 0) return -1
  const titleItem = toc[titleIndex]!
  const titlePosition = tocItemPositionIndex(titleItem, positions)
  const titleHasNotAdvancedPastPage =
    currentPage == null || titlePosition == null || titlePosition <= currentPage

  if (!titleHasNotAdvancedPastPage) return -1
  if (closestBeforeIndex >= 0 && titleIndex < closestBeforeIndex) return -1
  return titleIndex
}

function normalizedTitle(title: string): string {
  return title.replace(/\s+/g, "").trim()
}
