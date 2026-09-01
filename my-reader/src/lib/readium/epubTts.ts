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
const POINT_READ_ATTRIBUTE = "data-myreader-tts-point-read"
const POINT_READ_HOVER_ATTRIBUTE = "data-myreader-tts-point-read-hover"
const POINT_READ_STYLE_ID = "myreader-tts-point-read-style"
const POINT_READ_INTERACTIVE_SELECTOR = [
  "a",
  "button",
  "input",
  "textarea",
  "select",
  "option",
  "summary",
  "audio",
  "video",
  '[role="button"]',
  '[role="link"]',
  '[contenteditable]:not([contenteditable="false"])',
].join(",")

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

export function setEpubTtsPointReadEnabled(
  document: Document,
  enabled: boolean,
): void {
  document
    .querySelectorAll(
      `[${POINT_READ_ATTRIBUTE}], [${POINT_READ_HOVER_ATTRIBUTE}]`,
    )
    .forEach((element) => {
      element.removeAttribute(POINT_READ_ATTRIBUTE)
      element.removeAttribute(POINT_READ_HOVER_ATTRIBUTE)
    })

  const existingStyle = document.getElementById(POINT_READ_STYLE_ID)
  if (!enabled) {
    existingStyle?.remove()
    return
  }

  if (!existingStyle) {
    const style = document.createElement("style")
    style.id = POINT_READ_STYLE_ID
    style.textContent = `[${POINT_READ_HOVER_ATTRIBUTE}] { cursor: pointer !important; }`
    document.head.appendChild(style)
  }
  contentTextBlocks(document).forEach((element) =>
    element.setAttribute(POINT_READ_ATTRIBUTE, ""),
  )
}

function pointReadTarget(event: Event): Element | null {
  const target = event.target as Element | null
  if (!target || target.nodeType !== Node.ELEMENT_NODE) return null
  if (target.closest(POINT_READ_INTERACTIVE_SELECTOR)) return null
  return target.closest(`[${POINT_READ_ATTRIBUTE}]`)
}

function pointIntersectsText(
  document: Document,
  element: Element,
  point: { x: number; y: number },
): boolean {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  const range = document.createRange()

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!normalizedText(node.textContent)) continue
    range.selectNodeContents(node)
    if (
      Array.from(range.getClientRects()).some(
        (rect) =>
          point.x >= rect.left &&
          point.x <= rect.right &&
          point.y >= rect.top &&
          point.y <= rect.bottom,
      )
    )
      return true
  }
  return false
}

function hasTextSelection(document: Document): boolean {
  const selection = document.getSelection()
  return Boolean(
    selection && !selection.isCollapsed && selection.toString().trim(),
  )
}

export function connectEpubTtsPointReadBridge(
  document: Document,
  options: {
    getEnabled: () => boolean
    onReadAtPoint: (point: { x: number; y: number }) => void
  },
): () => void {
  let hoveredTarget: Element | null = null

  const setHoveredTarget = (target: Element | null) => {
    if (target === hoveredTarget) return
    hoveredTarget?.removeAttribute(POINT_READ_HOVER_ATTRIBUTE)
    target?.setAttribute(POINT_READ_HOVER_ATTRIBUTE, "")
    hoveredTarget = target
  }

  const handlePointerMove = (event: PointerEvent) => {
    if (!options.getEnabled()) {
      setHoveredTarget(null)
      return
    }
    const target = pointReadTarget(event)
    setHoveredTarget(
      target &&
        pointIntersectsText(document, target, {
          x: event.clientX,
          y: event.clientY,
        })
        ? target
        : null,
    )
  }

  const handlePointerOut = (event: PointerEvent) => {
    if (!event.relatedTarget) setHoveredTarget(null)
  }

  const handlePointerUp = (event: PointerEvent) => {
    if (
      !options.getEnabled() ||
      !event.isPrimary ||
      event.button !== 0 ||
      hasTextSelection(document) ||
      !pointReadTarget(event)
    )
      return

    // Point reading owns marked text-block clicks; avoid dispatching a second
    // click through Readium's peripheral bridge.
    event.stopImmediatePropagation()
  }

  const handleClick = (event: MouseEvent) => {
    if (
      !options.getEnabled() ||
      event.button !== 0 ||
      hasTextSelection(document)
    )
      return

    const target = pointReadTarget(event)
    if (!target) return

    event.stopImmediatePropagation()
    if (
      !pointIntersectsText(document, target, {
        x: event.clientX,
        y: event.clientY,
      })
    )
      return

    event.preventDefault()
    options.onReadAtPoint({ x: event.clientX, y: event.clientY })
  }

  document.addEventListener("pointermove", handlePointerMove, true)
  document.addEventListener("pointerout", handlePointerOut, true)
  document.addEventListener("pointerup", handlePointerUp, true)
  document.addEventListener("click", handleClick, true)
  return () => {
    setHoveredTarget(null)
    document.removeEventListener("pointermove", handlePointerMove, true)
    document.removeEventListener("pointerout", handlePointerOut, true)
    document.removeEventListener("pointerup", handlePointerUp, true)
    document.removeEventListener("click", handleClick, true)
  }
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

export function epubTtsUtteranceIndexAtLocator(
  utterances: EpubTtsUtterance[],
  locator: Locator,
): number {
  if (utterances.length === 0) return -1
  const highlight = locator.text?.highlight?.trim()
  const resourceIndexes = utterances
    .map((utterance, index) => ({ utterance, index }))
    .filter(({ utterance }) =>
      hrefRoughlyMatches(utterance.locator.href, locator.href),
    )
  if (resourceIndexes.length === 0) return -1
  if (highlight) {
    const targetBefore = normalizedText(locator.text?.before)
    const targetAfter = normalizedText(locator.text?.after)
    if (targetBefore || targetAfter) {
      const contextual = resourceIndexes.find(({ utterance }) => {
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
          ) {
            return true
          }
          offset = sentence.indexOf(highlight, offset + highlight.length)
        }
        return false
      })
      if (contextual) return contextual.index
    }
    const allowPartialHighlight = Array.from(highlight).length > 1
    const exact = resourceIndexes.find(({ utterance }) => {
      const sentence = utterance.locator.text?.highlight?.trim()
      return (
        sentence === highlight ||
        highlight.includes(sentence ?? "") ||
        (allowPartialHighlight && Boolean(sentence?.includes(highlight)))
      )
    })
    if (exact) return exact.index
  }
  const progression = locator.locations.progression ?? 0
  return (
    resourceIndexes.find(
      ({ utterance }) =>
        (utterance.locator.locations.progression ?? 0) >= progression,
    )?.index ?? resourceIndexes[resourceIndexes.length - 1]!.index
  )
}

function liveRangeForUtterance(
  document: Document,
  utterance: EpubTtsUtterance,
): Range | null {
  const highlight = utterance.locator.text?.highlight
  if (!highlight) return null
  const selector =
    utterance.locator.locations.otherLocations?.get("cssSelector")
  let root = document.body
  if (typeof selector === "string") {
    try {
      root = document.querySelector(selector) ?? document.body
    } catch {
      root = document.body
    }
  }
  const walker = document.createTreeWalker(
    root,
    document.defaultView?.NodeFilter.SHOW_TEXT ?? 4,
  )
  const nodes: Text[] = []
  let node = walker.nextNode()
  while (node) {
    nodes.push(node as Text)
    node = walker.nextNode()
  }
  const content = nodes.map((item) => item.data).join("")
  if (!content) return null

  const before = utterance.locator.text?.before?.trim()
  const after = utterance.locator.text?.after?.trim()
  const candidates: number[] = []
  let searchFrom = 0
  while (searchFrom <= content.length - highlight.length) {
    const index = content.indexOf(highlight, searchFrom)
    if (index < 0) break
    candidates.push(index)
    searchFrom = index + Math.max(1, highlight.length)
  }
  const startOffset =
    candidates.find((index) => {
      const beforeMatches =
        !before || content.slice(0, index).trimEnd().endsWith(before)
      const afterMatches =
        !after ||
        content
          .slice(index + highlight.length)
          .trimStart()
          .startsWith(after)
      return beforeMatches && afterMatches
    }) ?? candidates[0]
  if (startOffset === undefined) return null

  const positionAt = (
    offset: number,
  ): { node: Text; offset: number } | null => {
    let cursor = 0
    for (const textNode of nodes) {
      const next = cursor + textNode.data.length
      if (offset <= next) return { node: textNode, offset: offset - cursor }
      cursor = next
    }
    return null
  }
  const start = positionAt(startOffset)
  const end = positionAt(startOffset + highlight.length)
  if (!start || !end) return null
  const range = document.createRange()
  range.setStart(start.node, start.offset)
  range.setEnd(end.node, end.offset)
  return range
}

export function epubTtsUtteranceAtPoint(
  utterances: EpubTtsUtterance[],
  resourceHref: string,
  document: Document,
  point: { x: number; y: number },
): EpubTtsUtterance | null {
  for (const utterance of utterances) {
    if (!hrefRoughlyMatches(utterance.locator.href, resourceHref)) continue
    const range = liveRangeForUtterance(document, utterance)
    if (!range) continue
    const hit = Array.from(range.getClientRects()).some(
      (rect) =>
        point.x >= rect.left &&
        point.x <= rect.right &&
        point.y >= rect.top &&
        point.y <= rect.bottom,
    )
    if (hit) return utterance
  }
  return null
}
