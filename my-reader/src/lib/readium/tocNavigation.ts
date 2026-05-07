import type { EpubNavigator } from "@readium/navigator"
import { Link, Locator, LocatorLocations, type Publication } from "@readium/shared"

export type ReadiumTocTarget = {
  href: string
  type?: string
  title?: string
}

/**
 * Build a locator from a TOC target using readingOrder hrefs, so Readium's strict href matching works.
 */
export function tocTargetToLocator(
  publication: Publication,
  target: ReadiumTocTarget,
): Locator | null {
  const [hrefWithoutFragment, fragment] = target.href.split("#", 2)
  const readingOrderIndex = publication.readingOrder.items.findIndex(
    (link) => link.href === hrefWithoutFragment,
  )
  const readingOrderLink =
    readingOrderIndex >= 0 ? publication.readingOrder.items[readingOrderIndex] : null

  if (!readingOrderLink) {
    const link = publication.linkWithHref(target.href) ?? new Link(target)
    return link.locator
  }

  return new Locator({
    href: readingOrderLink.href,
    type: readingOrderLink.type ?? target.type ?? "",
    title: target.title ?? readingOrderLink.title,
    locations: new LocatorLocations({
      fragments: fragment ? [fragment] : [],
      position: readingOrderIndex + 1,
      progression: 0,
    }),
  })
}

/**
 * Return the zero-based readingOrder index for a TOC target.
 */
export function tocTargetReadingOrderIndex(
  publication: Publication,
  target: ReadiumTocTarget,
): number {
  const [hrefWithoutFragment] = target.href.split("#", 1)
  return publication.readingOrder.items.findIndex((link) => link.href === hrefWithoutFragment)
}

/**
 * Move fixed-layout Readium by the same path as page-turn buttons until the target spread is visible.
 */
export async function goToReadingOrderPositionBySteps(
  nav: EpubNavigator,
  targetPosition: number,
): Promise<boolean> {
  const isVisible = () => nav.viewport.positions?.includes(targetPosition) ?? false
  if (isVisible()) return true

  let guard = nav.publication.readingOrder.items.length + 2
  while (!isVisible() && guard > 0) {
    guard -= 1
    const firstVisible =
      nav.viewport.positions?.[0] ??
      nav.currentLocator.locations.position ??
      nav.publication.readingOrder.findIndexWithHref(nav.currentLocator.href) + 1
    const ok = await new Promise<boolean>((resolve) => {
      if (firstVisible < targetPosition) {
        nav.goForward(false, resolve)
      } else {
        nav.goBackward(false, resolve)
      }
    })
    if (!ok) return false
  }

  return isVisible()
}
