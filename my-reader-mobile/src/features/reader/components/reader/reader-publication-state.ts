import type { Locator } from "@my-reader/readium"
import { hrefRoughlyMatches } from "@my-reader/tools/reader-toc"

/** Resolve restoration before falling back to the publication's first position. */
export function resolveReaderStart(
  positions: Locator[],
  stored: Locator | undefined,
  current: Locator | null,
  resolveNativeLocator: (
    positions: Locator[],
    stored: Locator,
  ) => Locator | undefined,
) {
  const candidate = stored ?? current
  const resolved = candidate
    ? resolveNativeLocator(positions, candidate)
    : undefined
  if (resolved) {
    const locator: Locator =
      candidate && hrefRoughlyMatches(candidate.href, resolved.href)
        ? {
            ...resolved,
            ...candidate,
            href: resolved.href,
            locations: {
              ...resolved.locations,
              ...candidate.locations,
              position: resolved.locations?.position,
              progression:
                candidate.locations?.progression ??
                resolved.locations?.progression ??
                0,
            },
          }
        : resolved
    return {
      locator,
      source: stored ? "stored-progress" : "current-location",
    }
  }
  return { locator: positions[0], source: "publication-start" }
}

export function readerProgress(locator: Locator | undefined) {
  const progression =
    locator?.locations?.totalProgression ?? locator?.locations?.progression ?? 0
  return Math.round(progression * 100)
}

export function logReaderStart({
  format,
  positions,
  stored,
  resolved,
  source,
  publicationSeq,
}: {
  format: "FIXED" | "EPUB"
  positions: number
  stored: Locator | undefined
  resolved: Locator | undefined
  source: string
  publicationSeq?: number
}) {
  console.info("[reading-sync] reader:position-resolved", {
    format,
    ...(publicationSeq === undefined ? {} : { publicationSeq }),
    source,
    positions,
    storedHref: stored?.href ?? null,
    storedPosition: stored?.locations?.position ?? null,
    storedTotalProgression: stored?.locations?.totalProgression ?? null,
    resolvedHref: resolved?.href ?? null,
    resolvedPosition: resolved?.locations?.position ?? null,
    resolvedTotalProgression: resolved?.locations?.totalProgression ?? null,
  })
}
