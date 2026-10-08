import {
  hrefRoughlyMatches,
  type ReaderLocator,
} from "@my-reader/tools/reader-toc"
import { Locator, LocatorLocations, LocatorText } from "@readium/shared"
import {
  extractUtterances,
  makeGnd,
  type ReadiumSpeechUtterance,
} from "@readium/speech"
import type { EpubTextResource } from "@/lib/readium/epubContentLocators"

const TEXT_BLOCK_SELECTOR = [
  "address",
  "article",
  "aside",
  "blockquote",
  "caption",
  "dd",
  "dt",
  "figcaption",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "li",
  "main",
  "nav",
  "p",
  "pre",
  "section",
  "td",
  "th",
  '[role="heading"]',
].join(",")
const CONTEXT_LENGTH = 32

export type EpubTtsUtterance = ReadiumSpeechUtterance & {
  id: string
  locator: Locator
}

export type EpubTtsExtractionOptions = {
  fallbackLanguage?: string
  skipPageBreaks?: boolean
  skipFootnotes?: boolean
}

function normalizedText(value: string | null | undefined): string {
  return value?.replace(/\s+/g, " ").trim() ?? ""
}

function contentTextBlocks(doc: Document): Element[] {
  return Array.from(doc.querySelectorAll(TEXT_BLOCK_SELECTOR)).filter(
    (element) =>
      Boolean(normalizedText(element.textContent)) &&
      !Array.from(element.children).some(
        (child) =>
          child.matches(TEXT_BLOCK_SELECTOR) &&
          Boolean(normalizedText(child.textContent)),
      ),
  )
}

function cssSelector(element: Element): string {
  const parts: string[] = []
  let current: Element | null = element
  while (current && current !== current.ownerDocument.body) {
    const siblings = current.parentElement
      ? Array.from(current.parentElement.children).filter(
          (sibling) => sibling.tagName === current?.tagName,
        )
      : []
    parts.unshift(
      `${current.tagName.toLowerCase()}:nth-of-type(${siblings.indexOf(current) + 1})`,
    )
    current = current.parentElement
  }
  return ["body", ...parts].join(" > ")
}

function languageFor(element: Element, fallback?: string): string | undefined {
  const language =
    element.closest<HTMLElement>("[lang]")?.lang ||
    element.ownerDocument.documentElement.lang ||
    fallback
  return language?.trim() || undefined
}

function progressionBefore(
  doc: Document,
  element: Element,
  totalTextLength: number,
): number {
  if (!doc.body || totalTextLength <= 0) return 0
  const range = doc.createRange()
  range.setStart(doc.body, 0)
  range.setEndBefore(element)
  return Math.min(1, normalizedText(range.toString()).length / totalTextLength)
}

function nearestPosition(
  positions: ReaderLocator[],
  href: string,
  progression: number,
): ReaderLocator | undefined {
  const normalizedHref = href.split("#")[0]
  const resourcePositions = positions
    .filter((position) =>
      hrefRoughlyMatches(position.href.split("#")[0], normalizedHref),
    )
    .sort(
      (left, right) =>
        (left.locations?.progression ?? 0) -
        (right.locations?.progression ?? 0),
    )
  let nearest = resourcePositions[0]
  for (const position of resourcePositions) {
    if ((position.locations?.progression ?? 0) > progression) break
    nearest = position
  }
  return nearest
}

type SegmenterResult = Iterable<{ segment: string; index: number }>
type SegmenterConstructor = new (
  language?: string,
  options?: { granularity: "sentence" },
) => { segment: (text: string) => SegmenterResult }

function sentenceSegments(text: string, language?: string): string[] {
  const Segmenter = (Intl as typeof Intl & { Segmenter?: SegmenterConstructor })
    .Segmenter
  if (Segmenter) {
    const segmenter = new Segmenter(language, { granularity: "sentence" })
    return Array.from(segmenter.segment(text), ({ segment }) =>
      segment.trim(),
    ).filter(Boolean)
  }
  const matches = Array.from(
    text.matchAll(/[^.!?。！？…]+(?:[.!?。！？…]+|$)/gu),
  )
  return matches.map((match) => match[0].trim()).filter(Boolean)
}

type NormalizedTextIndex = {
  text: string
  rawStarts: number[]
  rawEnds: number[]
}

function normalizedTextIndex(rawText: string): NormalizedTextIndex {
  let text = ""
  const rawStarts: number[] = []
  const rawEnds: number[] = []
  let rawOffset = 0

  for (const character of rawText) {
    const rawEnd = rawOffset + character.length
    if (/\s/u.test(character)) {
      if (text.endsWith(" ")) {
        rawEnds[rawEnds.length - 1] = rawEnd
      } else {
        text += " "
        rawStarts.push(rawOffset)
        rawEnds.push(rawEnd)
      }
    } else {
      text += character
      for (let index = 0; index < character.length; index += 1) {
        rawStarts.push(rawOffset)
        rawEnds.push(rawEnd)
      }
    }
    rawOffset = rawEnd
  }

  const start = text.startsWith(" ") ? 1 : 0
  const end = text.endsWith(" ") ? -1 : undefined
  return {
    text: text.slice(start, end),
    rawStarts: rawStarts.slice(start, end),
    rawEnds: rawEnds.slice(start, end),
  }
}

function locateNormalizedText(
  source: string,
  text: string,
  from: number,
): { start: number; end: number } | null {
  const exact = source.indexOf(text, from)
  if (exact >= 0) return { start: exact, end: exact + text.length }

  const characters = Array.from(text)
  const start = source.indexOf(characters[0] ?? "", from)
  if (start < 0) return null
  let cursor = start + (characters[0]?.length ?? 0)
  for (const character of characters.slice(1)) {
    const next = source.indexOf(character, cursor)
    if (next < 0 || next - start > text.length + 64) return null
    cursor = next + character.length
  }
  return { start, end: cursor }
}

function readiumUtterancesForElement(
  element: Element,
  language: string | undefined,
  options: EpubTtsExtractionOptions,
): ReadiumSpeechUtterance[] {
  const skip = [
    ...(options.skipPageBreaks ? ["pagebreak"] : []),
    ...(options.skipFootnotes
      ? ["footnote", "endnote", "doc-footnote", "doc-endnote"]
      : []),
  ]
  const safeLanguage = language?.match(/^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/u)?.[0]
  const languageAttribute = safeLanguage ? ` lang="${safeLanguage}"` : ""
  const gnd = makeGnd(
    `<div${languageAttribute}>${element.outerHTML}</div>`,
    "text/html",
  )
  return extractUtterances(gnd.guided, {
    format: "plain",
    language: "always",
    skip,
  })
}

function locatorForSentence(
  resource: EpubTextResource,
  positions: ReaderLocator[],
  element: Element,
  rawStart: number,
  rawEnd: number,
  progression: number,
): Locator {
  const rawText = element.textContent ?? ""
  const start = Math.max(0, rawStart)
  const end = Math.max(start, rawEnd)
  const highlight = rawText.slice(start, end)
  const nearest = nearestPosition(positions, resource.href, progression)
  const fragment = element.id || element.closest<HTMLElement>("[id]")?.id
  const otherLocations = new Map<string, unknown>([
    ["cssSelector", cssSelector(element)],
  ])
  return new Locator({
    href: resource.href,
    type: resource.type,
    title: resource.title,
    locations: new LocatorLocations({
      progression,
      position: nearest?.locations?.position,
      totalProgression: nearest?.locations?.totalProgression,
      fragments: fragment ? [fragment] : undefined,
      otherLocations,
    }),
    text: new LocatorText({
      before: rawText.slice(Math.max(0, start - CONTEXT_LENGTH), start),
      highlight,
      after: rawText.slice(end, end + CONTEXT_LENGTH),
    }),
  })
}

export function extractEpubTtsUtterances(
  resources: EpubTextResource[],
  positions: ReaderLocator[],
  options: EpubTtsExtractionOptions = {},
): EpubTtsUtterance[] {
  const result: EpubTtsUtterance[] = []

  resources.forEach((resource, resourceIndex) => {
    const doc = new DOMParser().parseFromString(resource.html, "text/html")
    const totalTextLength = normalizedText(doc.body?.textContent).length
    if (totalTextLength === 0) return

    contentTextBlocks(doc).forEach((element, blockIndex) => {
      const language = languageFor(element, options.fallbackLanguage)
      const blockProgression = progressionBefore(doc, element, totalTextLength)
      const extracted = readiumUtterancesForElement(element, language, options)
      const rawText = element.textContent ?? ""
      const rawIndex = normalizedTextIndex(rawText)
      let normalizedSearchStart = 0
      let sentenceIndex = 0
      extracted.forEach((utterance) => {
        const plain = normalizedText(utterance.plain)
        if (!plain) return
        sentenceSegments(plain, utterance.language ?? language).forEach(
          (segment) => {
            const text = normalizedText(segment)
            if (!text) return
            const normalizedRange = locateNormalizedText(
              rawIndex.text,
              text,
              normalizedSearchStart,
            )
            if (!normalizedRange) return
            const { start: normalizedStart, end: normalizedEnd } =
              normalizedRange
            normalizedSearchStart = normalizedEnd
            const rawStart = rawIndex.rawStarts[normalizedStart]
            const rawEnd = rawIndex.rawEnds[normalizedEnd - 1]
            if (rawStart == null || rawEnd == null || rawEnd <= rawStart) return
            const id = `tts-${resourceIndex}-${blockIndex}-${sentenceIndex}`
            sentenceIndex += 1
            const progression = Math.min(
              1,
              blockProgression + normalizedStart / totalTextLength,
            )
            result.push({
              id,
              plain: text,
              language: utterance.language ?? language,
              locator: locatorForSentence(
                resource,
                positions,
                element,
                rawStart,
                rawEnd,
                progression,
              ),
            })
          },
        )
      })
    })
  })

  return result
}

type EpubTtsLocatorMatch = {
  index: number
  highlightOffset: number | null
}

export type EpubTtsPlaybackPlan = {
  index: number
  utterances: EpubTtsUtterance[]
}

function epubTtsUtteranceMatchAtLocator(
  utterances: EpubTtsUtterance[],
  locator: Locator,
): EpubTtsLocatorMatch | null {
  if (utterances.length === 0) return null
  const highlight = locator.text?.highlight?.trim()
  const resourceIndexes = utterances
    .map((utterance, index) => ({ utterance, index }))
    .filter(({ utterance }) =>
      hrefRoughlyMatches(utterance.locator.href, locator.href),
    )
  if (resourceIndexes.length === 0) return null
  if (highlight) {
    const match =
      matchTtsHighlightContext(resourceIndexes, locator, highlight) ??
      matchTtsHighlightText(resourceIndexes, highlight)
    if (match) return match
  }
  const progression = locator.locations.progression ?? 0
  const match =
    resourceIndexes.find(
      ({ utterance }) =>
        (utterance.locator.locations.progression ?? 0) >= progression,
    ) ?? resourceIndexes[resourceIndexes.length - 1]!
  return { index: match.index, highlightOffset: null }
}

type IndexedTtsUtterance = { utterance: EpubTtsUtterance; index: number }

function ttsHighlightContextOffset(
  utterance: EpubTtsUtterance,
  highlight: string,
  targetBefore: string,
  targetAfter: string,
): number | null {
  const sentence = utterance.locator.text?.highlight ?? ""
  let offset = sentence.indexOf(highlight)
  while (offset >= 0) {
    const before = normalizedText(
      `${utterance.locator.text?.before ?? ""}${sentence.slice(0, offset)}`,
    )
    const after = normalizedText(
      `${sentence.slice(offset + highlight.length)}${utterance.locator.text?.after ?? ""}`,
    )
    if (
      (!targetBefore || before.endsWith(targetBefore)) &&
      (!targetAfter || after.startsWith(targetAfter))
    )
      return offset
    offset = sentence.indexOf(highlight, offset + highlight.length)
  }
  return null
}

function matchTtsHighlightContext(
  resourceIndexes: IndexedTtsUtterance[],
  locator: Locator,
  highlight: string,
): EpubTtsLocatorMatch | null {
  const targetBefore = normalizedText(locator.text?.before)
  const targetAfter = normalizedText(locator.text?.after)
  if (!targetBefore && !targetAfter) return null
  for (const { utterance, index } of resourceIndexes) {
    const offset = ttsHighlightContextOffset(
      utterance,
      highlight,
      targetBefore,
      targetAfter,
    )
    if (offset !== null) return { index, highlightOffset: offset }
  }
  return null
}

function matchTtsHighlightText(
  resourceIndexes: IndexedTtsUtterance[],
  highlight: string,
): EpubTtsLocatorMatch | null {
  const allowPartialHighlight = Array.from(highlight).length > 1
  for (const { utterance, index } of resourceIndexes) {
    const sentence = utterance.locator.text?.highlight?.trim()
    if (!sentence) continue
    if (sentence === highlight || highlight.includes(sentence)) {
      return { index, highlightOffset: 0 }
    }
    if (allowPartialHighlight && sentence.includes(highlight)) {
      return { index, highlightOffset: sentence.indexOf(highlight) }
    }
  }
  return null
}

export function epubTtsUtteranceIndexAtLocator(
  utterances: EpubTtsUtterance[],
  locator: Locator,
): number {
  return epubTtsUtteranceMatchAtLocator(utterances, locator)?.index ?? -1
}

export function epubTtsPlaybackPlanAtLocator(
  utterances: EpubTtsUtterance[],
  locator: Locator,
): EpubTtsPlaybackPlan | null {
  const match = epubTtsUtteranceMatchAtLocator(utterances, locator)
  if (!match) return null
  const utterance = utterances[match.index]
  const sentence = utterance?.locator.text?.highlight ?? ""
  const offset = match.highlightOffset
  if (
    !utterance ||
    offset === null ||
    normalizedText(sentence.slice(0, offset)).length === 0
  ) {
    return { index: match.index, utterances }
  }

  const utterancePlain = utterance.plain ?? sentence
  const plainOffset = plainOffsetAtLocatorOffset(
    sentence,
    utterancePlain,
    offset,
  )
  const plain = utterancePlain.slice(plainOffset).trimStart()
  const highlight = sentence.slice(offset).trimStart()
  if (!/[\p{L}\p{N}]/u.test(plain) || !highlight) {
    const index = match.index + 1
    return index < utterances.length ? { index, utterances } : null
  }

  const otherLocations = new Map(
    utterance.locator.locations.otherLocations ?? [],
  )
  locator.locations.otherLocations?.forEach((value, key) => {
    otherLocations.set(key, value)
  })
  otherLocations.delete("domRange")
  const clipped: EpubTtsUtterance = {
    ...utterance,
    plain,
    locator: new Locator({
      href: utterance.locator.href,
      type: utterance.locator.type,
      title: utterance.locator.title,
      locations: new LocatorLocations({
        fragments:
          locator.locations.fragments.length > 0
            ? locator.locations.fragments
            : utterance.locator.locations.fragments,
        progression: locator.locations.progression,
        totalProgression:
          locator.locations.totalProgression ??
          utterance.locator.locations.totalProgression,
        position:
          locator.locations.position ?? utterance.locator.locations.position,
        otherLocations,
      }),
      text: new LocatorText({
        before: locator.text?.before,
        highlight,
        after: utterance.locator.text?.after,
      }),
    }),
  }
  const queue = [...utterances]
  queue[match.index] = clipped
  return { index: match.index, utterances: queue }
}

function plainOffsetAtLocatorOffset(
  locatorText: string,
  plainText: string,
  locatorOffset: number,
): number {
  const locatorIndex = normalizedTextIndex(locatorText)
  const plainIndex = normalizedTextIndex(plainText)
  let locatorCursor = 0

  for (
    let plainCursor = 0;
    plainCursor < plainIndex.text.length;
    plainCursor += 1
  ) {
    const character = plainIndex.text[plainCursor]!
    const match = locatorIndex.text.indexOf(character, locatorCursor)
    if (match < 0) break
    if ((locatorIndex.rawStarts[match] ?? 0) >= locatorOffset) {
      return plainIndex.rawStarts[plainCursor] ?? plainText.length
    }
    locatorCursor = match + 1
  }

  return plainText.length
}
