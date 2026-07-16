export interface ReaderLocatorLocations {
  fragments?: string[]
  progression: number
  position?: number
  totalProgression?: number
  cssSelector?: string
  partialCfi?: string
  domRange?: ReaderLocatorDomRange
  otherLocations?:
    | ReadonlyMap<string, unknown>
    | Readonly<Record<string, unknown>>
}

export interface ReaderLocatorDomRangePoint {
  cssSelector: string
  textNodeIndex: number
  charOffset?: number
  /** Legacy Readium key accepted when restoring older persisted Locators. */
  offset?: number
}

export interface ReaderLocatorDomRange {
  start: ReaderLocatorDomRangePoint
  end?: ReaderLocatorDomRangePoint
}

export interface ReaderLocatorText {
  before?: string
  highlight?: string
  after?: string
}

export interface ReaderLocator {
  href: string
  type: string
  target?: number
  title?: string
  locations?: ReaderLocatorLocations
  text?: ReaderLocatorText
}

export interface ReaderLink {
  href: string
  title?: string
  type?: string
  rels?: string[]
  languages?: string[]
  depth?: number
  hasChildren?: boolean
  parentHref?: string
  position?: number
  children?: ReaderLink[]
}

export type ReaderTocItem = {
  id: string
  label: string
  depth?: number
  pageIndex: number
  chapterIndex?: number
  href?: string
  locator?: ReaderLocator
  locatorSource?: "resource" | "content"
}

export type ReaderContentElement = {
  text: string
  locator: ReaderLocator
}

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
  positions?: ReaderLocator[]
  locator?: ReaderLocator | null
  currentHref?: string | null
  currentPage?: number | null
  currentTitle?: string | null
  selectedTocItem?: ReaderTocItem | null
  fallbackTitle?: string | null
}

export type ResolveReaderTocAtPositionInput = {
  toc: ReaderTocItem[]
  positions: ReaderLocator[]
  positionIndex: number
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

export function locatorWithHrefFragments(
  locator: ReaderLocator,
): ReaderLocator {
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
  positions: ReaderLocator[] | undefined,
  locator: ReaderLocator,
): number {
  const position = locator.locations?.position
  if (typeof position === "number" && position >= 1) {
    const matchingPosition = positions?.findIndex(
      (candidate) => candidate.locations?.position === position,
    )
    if (matchingPosition != null && matchingPosition >= 0) {
      return matchingPosition
    }
    return clampPositionIndex(position - 1, positions?.length ?? position)
  }

  if (positions == null || positions.length === 0) return 0

  const matchingResource = positions
    .map((candidate, index) => ({ candidate, index }))
    .filter(({ candidate }) => hrefRoughlyMatches(candidate.href, locator.href))
  const localProgression = locator.locations?.progression
  if (
    matchingResource.length > 0 &&
    typeof localProgression === "number" &&
    Number.isFinite(localProgression)
  ) {
    const started = matchingResource
      .filter(
        ({ candidate }) =>
          (candidate.locations?.progression ?? 0) <= localProgression,
      )
      .sort(
        (a, b) =>
          (b.candidate.locations?.progression ?? 0) -
          (a.candidate.locations?.progression ?? 0),
      )
    return started[0]?.index ?? matchingResource[0]!.index
  }
  if (matchingResource.length > 0) return matchingResource[0]!.index

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

export function findLocatorForLinkHref(
  positions: ReaderLocator[],
  linkHref: string | undefined,
): ReaderLocator | undefined {
  if (!linkHref || positions.length === 0) return undefined
  return positions.find((p) => hrefRoughlyMatches(p.href, linkHref))
}

export function locatorForTocLink(
  link: ReaderLink,
  positions: ReaderLocator[],
): ReaderLocator | undefined {
  const href = link.href
  if (!href) return undefined

  const baseLocator = findLocatorForLinkHref(positions, href)
  if (!hasFragment(href)) return baseLocator

  const locations: NonNullable<ReaderLocator["locations"]> = {
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
    type: baseLocator?.type ?? link.type ?? "application/xhtml+xml",
    title: link.title,
    locations,
  }
}

export function locatorWithTocHref(
  locator: ReaderLocator,
  item: ReaderTocItem,
): ReaderLocator {
  if (!item.href) {
    return {
      ...locator,
      title: item.label,
    }
  }

  const fragment = fragmentFromHref(item.href)
  const fragments = locator.locations?.fragments ?? []
  const locations: NonNullable<ReaderLocator["locations"]> = {
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

export function locatorWithTocSelection(
  locator: ReaderLocator,
  selectedTocItem: ReaderTocItem | null,
): ReaderLocator {
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

export function resolveNativeLocator(
  positions: ReaderLocator[],
  stored: ReaderLocator,
): ReaderLocator | undefined {
  if (positions.length === 0) return undefined
  const position = stored.locations?.position
  let byPosition: ReaderLocator | undefined
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
): string {
  const pathPart = path.join(".")
  return `${prefix}-${pathPart}-${rawHref ?? "no-href"}`
}

export function linksToTocItems(
  links: ReaderLink[],
  positions: ReaderLocator[],
  options: { idPrefix?: string; fallbackLabelPrefix?: string } = {},
): ReaderTocItem[] {
  const items: ReaderTocItem[] = []
  let flatIndex = 0
  const idPrefix = options.idPrefix ?? "readium"
  const fallbackLabelPrefix = options.fallbackLabelPrefix ?? "Chapter"

  function walk(list: ReaderLink[], parentPath: number[] = []) {
    for (const [idx, link] of list.entries()) {
      const path = [...parentPath, idx]
      const href = link.href
      const locator = locatorForTocLink(link, positions)
      items.push({
        id: buildTocItemId(idPrefix, path, href),
        label: link.title ?? `${fallbackLabelPrefix} ${flatIndex + 1}`,
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

const MIN_PARTIAL_HEADING_MATCH_LENGTH = 8

function normalizedContentText(text: string | undefined): string {
  return text?.replace(/\s+/g, "").trim() ?? ""
}

function headingTextMatches(contentText: string, tocItemText: string): boolean {
  if (!contentText || !tocItemText) return false
  if (contentText.startsWith(tocItemText)) return true
  return (
    contentText.length >= MIN_PARTIAL_HEADING_MATCH_LENGTH &&
    tocItemText.startsWith(contentText)
  )
}

export function enhanceTocItemsWithContentLocators(
  tocItems: ReaderTocItem[],
  contentElements: ReaderContentElement[],
): ReaderTocItem[] {
  if (tocItems.length === 0 || contentElements.length === 0) return tocItems

  let changed = false
  const enhanced = tocItems.map((item) => {
    const itemText = normalizedContentText(item.label)
    if (!itemText || !item.href) return item

    const matches = contentElements.filter((element) => {
      return (
        headingTextMatches(normalizedContentText(element.text), itemText) &&
        hrefRoughlyMatches(element.locator.href, item.href!)
      )
    })
    const itemFragment = fragmentFromHref(item.href)
    const match =
      (itemFragment
        ? matches.find((element) => {
            return (
              fragmentFromHref(element.locator.href) === itemFragment ||
              element.locator.locations?.fragments?.includes(itemFragment)
            )
          })
        : undefined) ?? matches[matches.length - 1]
    if (!match) return item

    changed = true
    return {
      ...item,
      locator: locatorWithTocHref(match.locator, item),
      locatorSource: "content" as const,
    }
  })

  return changed ? enhanced : tocItems
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

  const sameResourceProgressions =
    href == null
      ? []
      : toc
          .filter(
            (item) => item.href != null && hrefRoughlyMatches(href, item.href),
          )
          .map((item) => locatorProgression(tocItemLocator(item, positions)))
          .filter((value): value is number => value != null)
  const hasEnhancedSameResourceProgression =
    href != null &&
    toc.some(
      (item) =>
        item.locatorSource === "content" &&
        item.href != null &&
        hrefRoughlyMatches(href, item.href),
    ) &&
    new Set(sameResourceProgressions).size > 1
  if (
    href != null &&
    progression != null &&
    !hasFragment(href) &&
    hasEnhancedSameResourceProgression
  ) {
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

export function resolveReaderTocAtPosition({
  toc,
  positions,
  positionIndex,
  fallbackTitle,
}: ResolveReaderTocAtPositionInput): ReaderTocResolution {
  const locator = positions[positionIndex]
  return resolveReaderToc({
    toc,
    positions,
    locator,
    currentPage: positionIndex,
    fallbackTitle: fallbackTitle ?? locator?.title,
  })
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

function locatorProgression(
  locator: ReaderLocator | undefined,
): number | undefined {
  const progression = locator?.locations?.progression
  return typeof progression === "number" && Number.isFinite(progression)
    ? progression
    : undefined
}

function locatorPositionMatchesTotalProgression(
  positions: ReaderLocator[],
  locator: ReaderLocator,
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

function tocItemLocator(
  item: ReaderTocItem,
  positions: ReaderLocator[] | undefined,
): ReaderLocator | undefined {
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
  positions: ReaderLocator[] | undefined,
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
  positions: ReaderLocator[] | undefined,
  currentPage: number | null,
): boolean {
  if (currentPage == null) return true
  const positionIndex = tocItemPositionIndex(item, positions)
  return positionIndex == null || positionIndex <= currentPage
}

function positionHrefIndex(
  toc: ReaderTocItem[],
  positions: ReaderLocator[] | undefined,
  currentPage: number,
): number {
  const positionLocator = positions?.[currentPage]
  if (!positionLocator) return -1
  return exactHrefIndex(toc, positionLocator.href)
}

function hasStartedNestedTocItem(
  toc: ReaderTocItem[],
  positions: ReaderLocator[] | undefined,
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
  positions: ReaderLocator[] | undefined,
  currentHref: string,
  currentProgression: number,
): number {
  const candidates = toc
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
      } =>
        entry.item.href != null &&
        hrefRoughlyMatches(currentHref, entry.item.href) &&
        entry.progression != null,
    )

  return (
    candidates
      .filter(({ progression }) => progression <= currentProgression)
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
  positions: ReaderLocator[] | undefined,
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
  positions: ReaderLocator[] | undefined,
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
