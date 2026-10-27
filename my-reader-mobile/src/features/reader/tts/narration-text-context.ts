import type { Locator, Utterance } from "@my-reader/readium"
import { hrefRoughlyMatches } from "@my-reader/tools/reader-toc"

const CONTEXT_LENGTH = 900

function bounded(before: string, after: string) {
  return {
    before: Array.from(before).slice(-CONTEXT_LENGTH).join(""),
    after: Array.from(after).slice(0, CONTEXT_LENGTH).join(""),
  }
}

/** Readium locator text surrounds a sentence inside its paragraph, not the scene. */
export function narrationTextContext(
  utterances: Utterance[],
  locator: Locator,
  text: string,
) {
  const fallback = bounded(
    locator.text?.before ?? "",
    locator.text?.after ?? "",
  )
  if (!text) return fallback
  const resource = utterances.filter((item) =>
    hrefRoughlyMatches(item.locator.href, locator.href),
  )
  const selector =
    locator.locations?.cssSelector ??
    locator.locations?.domRange?.start.cssSelector
  const candidates = resource
    .flatMap((item, index) => {
      const matches = []
      let offset = item.text.indexOf(text)
      while (offset >= 0) {
        const before = item.text.slice(0, offset)
        const after = item.text.slice(offset + text.length)
        const itemSelector =
          item.locator.locations?.cssSelector ??
          item.locator.locations?.domRange?.start.cssSelector
        const progression = locator.locations?.progression
        const itemProgression = item.locator.locations?.progression
        matches.push({
          index,
          offset,
          sameElement: Boolean(selector && selector === itemSelector),
          sameTextAnchor: Boolean(
            (locator.text?.before?.trim() &&
              before.endsWith(locator.text.before)) ||
              (locator.text?.after?.trim() &&
                after.startsWith(locator.text.after)),
          ),
          distance:
            progression !== undefined && itemProgression !== undefined
              ? Math.abs(progression - itemProgression)
              : Infinity,
        })
        offset = item.text.indexOf(text, offset + text.length)
      }
      return matches
    })
    .sort(
      (a, b) =>
        Number(b.sameElement) - Number(a.sameElement) ||
        a.distance - b.distance ||
        Number(b.sameTextAnchor) - Number(a.sameTextAnchor),
    )
  const match = candidates[0]
  const next = candidates[1]
  if (
    !match ||
    (next &&
      match.sameElement === next.sameElement &&
      match.sameTextAnchor === next.sameTextAnchor &&
      match.distance === next.distance)
  )
    return fallback
  const current = resource[match.index]!.text
  return bounded(
    [
      ...resource.slice(0, match.index).map((item) => item.text),
      current.slice(0, match.offset),
    ].join("\n"),
    [
      current.slice(match.offset + text.length),
      ...resource.slice(match.index + 1).map((item) => item.text),
    ].join("\n"),
  )
}
