/**
 * A location within a publication, carried across the JS<->native bridge.
 * Mirrors Readium's `Locator` (ReadiumShared) — kept structurally identical
 * so locators can be persisted and restored across platforms.
 */
export interface LocatorLocations {
  progression: number;
  position?: number;
  totalProgression?: number;
}

export interface LocatorText {
  before?: string;
  highlight?: string;
  after?: string;
}

export interface Locator {
  href: string;
  type: string;
  target?: number;
  title?: string;
  locations?: LocatorLocations;
  text?: LocatorText;
}
