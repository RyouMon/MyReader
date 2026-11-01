import { READER_ANNOTATION_COLORS } from "./reader-annotations"
import { normalizedTextIndex } from "./reader-text-index"
import { hrefRoughlyMatches, type ReaderLocator } from "./reader-toc"

export type ReadingPlanEntry = {
  id: string
  sourceKey: string
  position: number | null
  characterId: string
  characterName: string
  speech: {
    text: string
    startUtf16: number
    endUtf16: number
    instructions: string
  }
}

/** Resolve a selected source range against current Core output, even after rechunking. */
export function narrationSpeechForEntry<T extends ReadingPlanEntry>(
  entries: T[],
  selected: ReadingPlanEntry,
): T["speech"][] {
  const { startUtf16: start, endUtf16: end, text } = selected.speech
  const parts = entries
    .filter(
      (entry) =>
        entry.sourceKey === selected.sourceKey &&
        entry.speech.endUtf16 > start &&
        entry.speech.startUtf16 < end,
    )
    .map(({ speech }) => ({
      ...speech,
      text: speech.text.slice(
        Math.max(0, start - speech.startUtf16),
        Math.min(speech.text.length, end - speech.startUtf16),
      ),
      startUtf16: Math.max(start, speech.startUtf16) - start,
      endUtf16: Math.min(end, speech.endUtf16) - start,
    }))
  if (
    !parts.length ||
    parts[0]!.startUtf16 !== 0 ||
    parts[parts.length - 1]!.endUtf16 !== end - start ||
    parts.some(
      (part, i) => i > 0 && parts[i - 1]!.endUtf16 !== part.startUtf16,
    ) ||
    parts.map((part) => part.text).join("") !== text
  )
    throw new Error("NARRATION_PLAN_INVALID")
  return parts
}

export function narrationCharacterColor(id: string): string {
  const colors = Object.values(READER_ANNOTATION_COLORS)
  let hash = 0
  for (const character of id)
    hash = (hash * 31 + character.codePointAt(0)!) >>> 0
  return colors[hash % colors.length]!
}

/** Keep the element anchor; refine only the text quote for a synthesis subrange. */
export function narrationPlanLocator(
  entry: ReadingPlanEntry,
): ReaderLocator | null {
  try {
    const locator = JSON.parse(entry.sourceKey) as ReaderLocator
    if (!locator.href || !locator.type) return null
    const source = locator.text?.highlight
    if (!source) return locator
    const span = sourceSpan(source, entry.speech)
    if (!span) return null
    const [start, end] = span
    if (start === 0 && end === source.length) return locator
    const text = source.slice(start, end)
    const {
      domRange,
      partialCfi: _partialCfi,
      ...locations
    } = locator.locations ?? {}
    return {
      ...locator,
      locations: {
        ...locations,
        cssSelector: locations.cssSelector ?? domRange?.start.cssSelector,
      },
      text: {
        before: `${locator.text?.before ?? ""}${source.slice(0, start)}`.slice(
          -128,
        ),
        highlight: text,
        after:
          `${source.slice(start + text.length)}${locator.text?.after ?? ""}`.slice(
            0,
            128,
          ),
      },
    }
  } catch {
    return null
  }
}

function sourceSpan(
  source: string,
  speech: ReadingPlanEntry["speech"],
): [number, number] | null {
  if (source.slice(speech.startUtf16, speech.endUtf16) === speech.text)
    return [speech.startUtf16, speech.endUtf16]
  const normalized = normalizedTextIndex(source)
  const quote = normalizedTextIndex(speech.text).text
  if (!quote) return null
  if (normalized.text === quote) return [0, source.length]
  let offset = speech.startUtf16
  if (normalized.text.slice(offset, offset + quote.length) !== quote) {
    offset = normalized.text.indexOf(quote)
    if (offset < 0 || normalized.text.indexOf(quote, offset + 1) >= 0)
      return null
  }
  return [
    normalized.rawStarts[offset]!,
    normalized.rawEnds[offset + quote.length - 1]!,
  ]
}

export function narrationSourceKey(locator: ReaderLocator): string {
  // Readium bridges may serialize optional fields in a different order.
  const sort = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(sort)
      : value && typeof value === "object"
        ? Object.fromEntries(
            Object.entries(value)
              .filter(([, v]) => v !== undefined)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, v]) => [k, sort(v)]),
          )
        : value
  return JSON.stringify(sort(locator))
}

/** Locate the current source without confusing identical quotes in different blocks. */
function blockSelector(locator: ReaderLocator): string | undefined {
  return (
    locator.locations?.cssSelector ??
    locator.locations?.domRange?.start.cssSelector
  )
}

export function narrationPlanIndex(
  entries: ReadingPlanEntry[],
  current: ReaderLocator | null | undefined,
): number {
  if (!current) return -1
  const quote = normalizedTextIndex(current.text?.highlight ?? "").text
  const context = normalizedTextIndex(
    `${current.text?.before ?? ""}${current.text?.highlight ?? ""}${current.text?.after ?? ""}`,
  ).text
  const selector = blockSelector(current)
  let best = -1
  let bestScore = -Infinity
  entries.forEach((entry, index) => {
    const source = narrationPlanLocator(entry)
    if (!source || !hrefRoughlyMatches(source.href, current.href)) return
    const target = normalizedTextIndex(source.text?.highlight ?? "").text
    const sourceSelector = blockSelector(source)
    const sameBlock = !!selector && selector === sourceSelector
    const matchesQuote =
      !!quote && (target.includes(quote) || quote.includes(target))
    const matchesContext =
      context.length > quote.length &&
      (target.includes(context) || context.includes(target))
    const progression = source.locations?.progression ?? entry.position ?? 0
    const currentProgression =
      current.locations?.progression ?? current.locations?.totalProgression ?? 0
    const distance = Math.abs(progression - currentProgression)
    const score =
      (sameBlock ? 4 : 0) +
      (matchesQuote ? 2 : 0) +
      (matchesContext ? 1 : 0) -
      distance
    if (score > bestScore) {
      best = index
      bestScore = score
    }
  })
  return best
}

/** Reuse whole-paragraph annotations when Readium starts partway through it. */
export function narrationSpeechForText<
  T extends { text: string; startUtf16: number; endUtf16: number },
>(speech: T[], text: string): T[] {
  const source = speech.map((part) => part.text).join("")
  if (!source.endsWith(text) || !text) throw new Error("NARRATION_PLAN_INVALID")
  const offset = source.length - text.length
  return speech
    .filter((part) => part.endUtf16 > offset)
    .map((part) => ({
      ...part,
      text: part.text.slice(Math.max(0, offset - part.startUtf16)),
      startUtf16: Math.max(0, part.startUtf16 - offset),
      endUtf16: part.endUtf16 - offset,
    }))
}
