/**
 * A location within a publication, carried across the JS<->native bridge.
 * Mirrors Readium's `Locator` (ReadiumShared) — kept structurally identical
 * so locators can be persisted and restored across platforms.
 */
export interface LocatorLocations {
  fragments?: string[]
  progression: number
  position?: number
  totalProgression?: number
  cssSelector?: string
  partialCfi?: string
  domRange?: LocatorDomRange
  otherLocations?:
    | ReadonlyMap<string, unknown>
    | Readonly<Record<string, unknown>>
}

export interface LocatorDomRangePoint {
  cssSelector: string
  textNodeIndex: number
  charOffset?: number
  /** Legacy Readium key accepted when restoring older persisted Locators. */
  offset?: number
}

export interface LocatorDomRange {
  start: LocatorDomRangePoint
  end?: LocatorDomRangePoint
}

export interface LocatorText {
  before?: string
  highlight?: string
  after?: string
}

export interface Locator {
  href: string
  type: string
  target?: number
  title?: string
  locations?: LocatorLocations
  text?: LocatorText
}
