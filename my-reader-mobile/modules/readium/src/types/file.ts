import type { Locator } from "./locator"

/**
 * A local publication file to open. `url` is a native filesystem path
 * (or absolute URL). `initialLocation` restores the last-read position.
 */
export interface ReadiumFile {
  url: string
  initialLocation?: Locator
}
