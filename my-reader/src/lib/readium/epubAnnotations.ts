import {
  READER_ANNOTATION_COLORS,
  type ReaderAnnotationColor,
  readerAnnotationTint,
} from "@my-reader/tools/reader-annotations"
import readerNoteMarkerStylesheetTemplate from "@my-reader/tools/reader-note-marker/reader-note-marker.css?raw"
import readerNoteMarkerElementTemplate from "@my-reader/tools/reader-note-marker/reader-note-marker.html?raw"
import type { ReaderLocator } from "@my-reader/tools/reader-toc"
import type { EpubNavigator } from "@readium/navigator"
import {
  type BasicTextSelection,
  type Decoration,
  type DecoratorRequest,
  Layout,
  Width,
} from "@readium/navigator-html-injectables"
import { Locator, LocatorLocations, LocatorText } from "@readium/shared"

const ANNOTATION_DECORATION_GROUP = "annotations"
const ANNOTATION_DECORATION_COLORS = Object.keys(
  READER_ANNOTATION_COLORS,
) as ReaderAnnotationColor[]
const ANNOTATION_DECORATION_GROUPS = [
  ANNOTATION_DECORATION_GROUP,
  ...ANNOTATION_DECORATION_COLORS.map(
    (color) => `${ANNOTATION_DECORATION_GROUP}-${color}`,
  ),
]
const CONTEXT_CHARACTER_LIMIT = 64
const NOTE_MARKER_LAYER_ID = "myreader-note-marker-layer"
const NOTE_MARKER_STYLE_ID = "myreader-note-marker-style"
const NOTE_MARKER_ID_ATTRIBUTE = "data-myreader-note-id"
const NOTE_MARKER_PLACEMENT_CLASS = "myreader-note-marker-placement"
const DESKTOP_NOTE_MARKER_HIT_SIZE = 32

type CssSelectorWindow = Window & {
  _readium_cssSelectorGenerator?: {
    getCssSelector: (element: Element) => string
  }
}

export type EpubAnnotationSelection = {
  locator: ReaderLocator
  contextMenu: { x: number; y: number }
  window: Window
}

type EpubTextContextMenuDocument = Document & {
  __myreaderEpubTextContextMenuHandler?: (event: MouseEvent) => void
}

export function suppressEpubTextSelectionContextMenu(wnd: Window): () => void {
  const doc = wnd.document as EpubTextContextMenuDocument
  const existing = doc.__myreaderEpubTextContextMenuHandler
  if (existing) return () => {}

  const handleContextMenu = (event: MouseEvent) => {
    const selection = currentTextSelection(wnd)
    if (!selection) return
    event.preventDefault()
  }
  doc.__myreaderEpubTextContextMenuHandler = handleContextMenu

  doc.addEventListener("contextmenu", handleContextMenu, true)
  return () => {
    if (doc.__myreaderEpubTextContextMenuHandler !== handleContextMenu) return
    doc.removeEventListener("contextmenu", handleContextMenu, true)
    delete doc.__myreaderEpubTextContextMenuHandler
  }
}

function currentTextSelection(wnd: Window): Selection | null {
  const selection = wnd.getSelection()
  if (!selection || selection.isCollapsed || !selection.toString().trim()) {
    return null
  }
  return selection
}

export type EpubAnnotationDecoration = {
  id: string
  locator: ReaderLocator
  color: ReaderAnnotationColor
  note?: string | null
}

type EpubAnnotationClickBridgeOptions = {
  iframe: HTMLIFrameElement
  container: HTMLElement
  getAnnotations: () => readonly EpubAnnotationDecoration[]
  onAnnotationClick: (selection: EpubAnnotationSelection) => void
  onAnnotationNoteClick: (annotationId: string) => void
  noteMarkerAccessibilityLabel: string
}

function normalizedResource(value: string): string {
  const withoutFragment = value.split("#")[0]
  if (!/^[a-z][a-z\d+.-]*:/i.test(withoutFragment)) {
    try {
      return decodeURIComponent(withoutFragment).replace(/^\.\//, "")
    } catch {
      return withoutFragment.replace(/^\.\//, "")
    }
  }
  try {
    return decodeURIComponent(
      new URL(withoutFragment, window.location.href).pathname,
    )
  } catch {
    try {
      return decodeURIComponent(withoutFragment)
    } catch {
      return withoutFragment
    }
  }
}

function resourceMatches(left: string, right: string): boolean {
  const normalizedLeft = normalizedResource(left)
  const normalizedRight = normalizedResource(right)
  return (
    normalizedLeft === normalizedRight ||
    normalizedLeft.endsWith(`/${normalizedRight.replace(/^\//, "")}`) ||
    normalizedRight.endsWith(`/${normalizedLeft.replace(/^\//, "")}`)
  )
}

export function epubAnnotationMatchesSelection(
  annotation: ReaderLocator,
  selection: ReaderLocator,
): boolean {
  return (
    resourceMatches(annotation.href, selection.href) &&
    annotation.locations?.cssSelector === selection.locations?.cssSelector &&
    annotation.text?.highlight?.trim() === selection.text?.highlight?.trim() &&
    annotation.text?.before?.trim() === selection.text?.before?.trim() &&
    annotation.text?.after?.trim() === selection.text?.after?.trim()
  )
}

function frameResourceHref(frame: {
  source: string
  iframe: HTMLIFrameElement
}): string {
  try {
    return frame.iframe.contentDocument?.baseURI ?? frame.source
  } catch {
    return frame.source
  }
}

function textRangeForLocator(
  doc: Document,
  locator: ReaderLocator,
): Range | null {
  const highlight = locator.text?.highlight
  if (!highlight) return null

  let root: Element = doc.body
  const cssSelector = locator.locations?.cssSelector
  if (cssSelector) {
    try {
      root = doc.querySelector(cssSelector) ?? doc.body
    } catch {
      root = doc.body
    }
  }

  const walker = doc.createTreeWalker(
    root,
    doc.defaultView?.NodeFilter.SHOW_TEXT ?? 4,
  )
  const nodes: Text[] = []
  let node = walker.nextNode()
  while (node) {
    nodes.push(node as Text)
    node = walker.nextNode()
  }
  const content = nodes.map((item) => item.data).join("")
  if (!content) return null

  const before = locator.text?.before?.trim()
  const after = locator.text?.after?.trim()
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
      if (offset <= next) {
        return { node: textNode, offset: offset - cursor }
      }
      cursor = next
    }
    return null
  }
  const start = positionAt(startOffset)
  const end = positionAt(startOffset + highlight.length)
  if (!start || !end) return null

  const range = doc.createRange()
  range.setStart(start.node, start.offset)
  range.setEnd(end.node, end.offset)
  return range
}

function contextMenuAtFramePoint(
  wnd: Window,
  iframe: HTMLIFrameElement,
  container: HTMLElement,
  point: { x: number; y: number },
): { x: number; y: number } {
  const frameRect = iframe.getBoundingClientRect()
  const containerRect = container.getBoundingClientRect()
  const scaleX = frameRect.width / Math.max(1, wnd.innerWidth)
  const scaleY = frameRect.height / Math.max(1, wnd.innerHeight)
  const rawX = frameRect.left + point.x * scaleX
  const rawY = frameRect.top + point.y * scaleY
  return {
    x: Math.min(
      Math.max(rawX, containerRect.left + 8),
      Math.max(containerRect.left + 8, containerRect.right - 8),
    ),
    y: Math.min(
      Math.max(rawY, containerRect.top + 8),
      Math.max(containerRect.top + 8, containerRect.bottom - 8),
    ),
  }
}

function noteMarkerPlacement(range: Range): { rect: DOMRect } | null {
  const rects = Array.from(range.getClientRects()).filter(
    (candidate) => candidate.width > 0 && candidate.height > 0,
  )
  const rect = rects[rects.length - 1]
  if (!rect) return null

  return { rect }
}

function desktopNoteMarkerStylesheet(): string {
  const hitOffset = DESKTOP_NOTE_MARKER_HIT_SIZE / 2
  return readerNoteMarkerStylesheetTemplate
    .split("{{hitSize}}")
    .join(String(DESKTOP_NOTE_MARKER_HIT_SIZE))
    .split("{{hitOffset}}")
    .join(String(hitOffset))
}

function createNoteMarkerElement(
  doc: Document,
  annotation: EpubAnnotationDecoration,
  accessibilityLabel: string,
): HTMLElement | null {
  const template = doc.createElement("template")
  template.innerHTML = readerNoteMarkerElementTemplate
  const anchor = template.content.firstElementChild?.cloneNode(
    true,
  ) as HTMLElement | null
  const button = anchor?.querySelector<HTMLButtonElement>(
    ".myreader-note-marker-hit",
  )
  const paper = anchor?.querySelector<HTMLElement>(
    ".myreader-note-marker-paper",
  )
  if (!anchor || !button || !paper) return null

  const tint = readerAnnotationTint(annotation.color)
  button.setAttribute(NOTE_MARKER_ID_ATTRIBUTE, annotation.id)
  button.setAttribute("aria-label", accessibilityLabel)
  button.title = accessibilityLabel
  button.style.setProperty("--myreader-note-color", tint)
  paper.style.setProperty("background-color", tint, "important")
  return anchor
}

function ensureNoteMarkerStyle(doc: Document): void {
  const stylesheet = `
    ${desktopNoteMarkerStylesheet()}
    #${NOTE_MARKER_LAYER_ID} {
      position: absolute;
      inset: 0 auto auto 0;
      z-index: 2147483000;
      width: 0;
      height: 0;
      pointer-events: none;
    }
    #${NOTE_MARKER_LAYER_ID} .${NOTE_MARKER_PLACEMENT_CLASS} {
      position: absolute;
      max-width: none !important;
      pointer-events: none;
    }
    #${NOTE_MARKER_LAYER_ID} .${NOTE_MARKER_PLACEMENT_CLASS} > .myreader-note-marker-anchor {
      position: relative;
      display: block;
      width: 100%;
      height: 100%;
    }
    #${NOTE_MARKER_LAYER_ID} .myreader-note-marker-hit {
      top: -${DESKTOP_NOTE_MARKER_HIT_SIZE / 2}px !important;
      right: -${DESKTOP_NOTE_MARKER_HIT_SIZE / 2}px !important;
      bottom: auto !important;
      left: auto !important;
    }
    #${NOTE_MARKER_LAYER_ID} .myreader-note-marker-hit:focus-visible {
      border-radius: 2px;
      outline: 2px solid currentColor;
      outline-offset: 1px;
    }
  `
  let style = doc.getElementById(
    NOTE_MARKER_STYLE_ID,
  ) as HTMLStyleElement | null
  if (!style) {
    style = doc.createElement("style")
    style.id = NOTE_MARKER_STYLE_ID
    doc.head.appendChild(style)
  }
  if (style.textContent !== stylesheet) style.textContent = stylesheet
}

function renderEpubNoteMarkers(
  wnd: Window,
  annotations: readonly EpubAnnotationDecoration[],
  accessibilityLabel: string,
): void {
  const doc = wnd.document
  ensureNoteMarkerStyle(doc)
  let layer = doc.getElementById(NOTE_MARKER_LAYER_ID)
  if (!layer) {
    layer = doc.createElement("div")
    layer.id = NOTE_MARKER_LAYER_ID
    doc.documentElement.appendChild(layer)
  }
  layer.replaceChildren()

  annotations
    .filter(
      (annotation) =>
        Boolean(annotation.note?.trim()) &&
        resourceMatches(doc.baseURI, annotation.locator.href),
    )
    .forEach((annotation) => {
      const range = textRangeForLocator(doc, annotation.locator)
      if (!range) return
      const markerPlacement = noteMarkerPlacement(range)
      const marker = createNoteMarkerElement(
        doc,
        annotation,
        accessibilityLabel,
      )
      if (!markerPlacement || !marker) return

      const placement = doc.createElement("div")
      placement.className = NOTE_MARKER_PLACEMENT_CLASS
      placement.style.left = `${markerPlacement.rect.left + wnd.scrollX}px`
      placement.style.top = `${markerPlacement.rect.top + wnd.scrollY}px`
      placement.style.width = `${markerPlacement.rect.width}px`
      placement.style.height = `${markerPlacement.rect.height}px`
      placement.appendChild(marker)
      layer.appendChild(placement)
    })
}

export function connectEpubAnnotationClickBridge(
  wnd: Window,
  {
    iframe,
    container,
    getAnnotations,
    onAnnotationClick,
    onAnnotationNoteClick,
    noteMarkerAccessibilityLabel,
  }: EpubAnnotationClickBridgeOptions,
): () => void {
  const handleClick = (event: MouseEvent) => {
    if (event.button !== 0) return
    const eventElement =
      event.target && (event.target as Node).nodeType === Node.ELEMENT_NODE
        ? (event.target as Element)
        : null
    const noteMarker = eventElement?.closest<HTMLElement>(
      `[${NOTE_MARKER_ID_ATTRIBUTE}]`,
    )
    const noteId = noteMarker?.getAttribute(NOTE_MARKER_ID_ATTRIBUTE)
    if (noteId) {
      event.preventDefault()
      event.stopImmediatePropagation()
      onAnnotationNoteClick(noteId)
      return
    }
    if (currentTextSelection(wnd)) return
    let activated:
      | { annotation: EpubAnnotationDecoration; rect: DOMRect }
      | undefined
    for (const candidate of getAnnotations()) {
      if (
        !resourceMatches(
          frameResourceHref({ source: wnd.location.href, iframe }),
          candidate.locator.href,
        )
      ) {
        continue
      }
      const range = textRangeForLocator(wnd.document, candidate.locator)
      if (!range) continue
      const rect = Array.from(range.getClientRects()).find(
        (rect) =>
          event.clientX >= rect.left &&
          event.clientX <= rect.right &&
          event.clientY >= rect.top &&
          event.clientY <= rect.bottom,
      )
      if (!rect) continue
      activated = { annotation: candidate, rect }
      break
    }
    if (!activated) return

    event.preventDefault()
    event.stopImmediatePropagation()
    onAnnotationClick({
      locator: activated.annotation.locator,
      contextMenu: contextMenuAtFramePoint(wnd, iframe, container, {
        x: activated.rect.left + activated.rect.width / 2,
        y: activated.rect.top,
      }),
      window: wnd,
    })
  }

  wnd.document.addEventListener("click", handleClick, true)
  let layoutFrame: number | null = null
  const updateMarkers = () => {
    if (layoutFrame !== null) wnd.cancelAnimationFrame(layoutFrame)
    layoutFrame = wnd.requestAnimationFrame(() => {
      layoutFrame = null
      renderEpubNoteMarkers(wnd, getAnnotations(), noteMarkerAccessibilityLabel)
    })
  }
  const ResizeObserverConstructor = (
    wnd as Window & { ResizeObserver?: typeof ResizeObserver }
  ).ResizeObserver
  const resizeObserver = ResizeObserverConstructor
    ? new ResizeObserverConstructor(updateMarkers)
    : null
  resizeObserver?.observe(wnd.document.documentElement)
  wnd.addEventListener("resize", updateMarkers)

  return () => {
    wnd.document.removeEventListener("click", handleClick, true)
    wnd.removeEventListener("resize", updateMarkers)
    resizeObserver?.disconnect()
    if (layoutFrame !== null) wnd.cancelAnimationFrame(layoutFrame)
    wnd.document.getElementById(NOTE_MARKER_LAYER_ID)?.remove()
    wnd.document.getElementById(NOTE_MARKER_STYLE_ID)?.remove()
  }
}

function readiumLocator(locator: ReaderLocator): Locator {
  const otherLocations = new Map<string, unknown>()
  if (locator.locations?.cssSelector) {
    otherLocations.set("cssSelector", locator.locations.cssSelector)
  }
  return new Locator({
    href: locator.href,
    type: locator.type,
    title: locator.title,
    locations: new LocatorLocations({
      fragments: locator.locations?.fragments,
      progression: locator.locations?.progression ?? 0,
      position: locator.locations?.position,
      totalProgression: locator.locations?.totalProgression,
      otherLocations: otherLocations.size > 0 ? otherLocations : undefined,
    }),
    text: locator.text ? new LocatorText(locator.text) : undefined,
  })
}

function decorationRequest(
  annotation: EpubAnnotationDecoration,
): DecoratorRequest {
  const tint = `${readerAnnotationTint(annotation.color)}66`
  const decoration: Decoration = {
    id: annotation.id,
    locator: readiumLocator(annotation.locator),
    style: { tint, layout: Layout.Boxes, width: Width.Wrap },
  }
  return {
    group: `${ANNOTATION_DECORATION_GROUP}-${annotation.color}`,
    action: "add",
    decoration,
  }
}

export function applyEpubAnnotations(
  navigator: EpubNavigator,
  annotations: readonly EpubAnnotationDecoration[],
  noteMarkerAccessibilityLabel = "Open note",
): void {
  navigator._cframes.forEach((frame) => {
    if (!frame) return
    if (frame.msg) {
      ANNOTATION_DECORATION_GROUPS.forEach((group) => {
        frame.msg?.send("decorate", {
          group,
          action: "clear",
          decoration: undefined,
        } satisfies DecoratorRequest)
      })
      annotations
        .filter((annotation) =>
          resourceMatches(frameResourceHref(frame), annotation.locator.href),
        )
        .forEach((annotation) => {
          frame.msg?.send("decorate", decorationRequest(annotation))
        })
    }
    const wnd = frame.iframe.contentWindow
    if (wnd) {
      renderEpubNoteMarkers(wnd, annotations, noteMarkerAccessibilityLabel)
    }
  })
}

function selectionContext(
  range: Range,
  anchor: Element,
): { before?: string; after?: string } {
  const beforeRange = range.cloneRange()
  beforeRange.selectNodeContents(anchor)
  beforeRange.setEnd(range.startContainer, range.startOffset)
  const before = beforeRange.toString().slice(-CONTEXT_CHARACTER_LIMIT).trim()

  const afterRange = range.cloneRange()
  afterRange.selectNodeContents(anchor)
  afterRange.setStart(range.endContainer, range.endOffset)
  const after = afterRange.toString().slice(0, CONTEXT_CHARACTER_LIMIT).trim()
  return {
    ...(before ? { before } : {}),
    ...(after ? { after } : {}),
  }
}

export function createEpubAnnotationSelection(
  navigator: EpubNavigator,
  selection: BasicTextSelection,
  container: HTMLElement,
  contextPoint: { x: number; y: number } = {
    x: selection.x + selection.width / 2,
    y: selection.y,
  },
  selectionWindow?: Window,
): EpubAnnotationSelection | null {
  const frame =
    navigator._cframes.find(
      (candidate) => candidate?.iframe.contentWindow === selectionWindow,
    ) ??
    navigator._cframes.find((candidate) => {
      if (!candidate) return false
      return (
        resourceMatches(candidate.source, selection.targetFrameSrc) ||
        candidate.iframe.contentWindow?.location.href ===
          selection.targetFrameSrc
      )
    })
  const wnd = frame?.iframe.contentWindow as CssSelectorWindow | null
  const domSelection = wnd?.getSelection()
  if (!frame || !wnd || !domSelection || domSelection.rangeCount === 0) {
    return null
  }

  const selectedText = selection.text.trim()
  if (!selectedText) return null
  const range = domSelection.getRangeAt(0)
  const anchor =
    range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
      ? (range.commonAncestorContainer as Element)
      : range.commonAncestorContainer.parentElement
  const cssSelector =
    anchor && wnd._readium_cssSelectorGenerator
      ? wnd._readium_cssSelectorGenerator.getCssSelector(anchor)
      : undefined
  if (!anchor || !cssSelector) return null

  const resourceIndex = navigator.publication.readingOrder.items.findIndex(
    (item) => resourceMatches(item.href, frameResourceHref(frame)),
  )
  const resource = navigator.publication.readingOrder.items[resourceIndex]
  if (!resource) return null
  const current = navigator.currentLocator
  const sameAsCurrent = resourceMatches(current.href, resource.href)
  const context = selectionContext(range, anchor)
  const locator: ReaderLocator = {
    href: resource.href,
    type: resource.type ?? "application/xhtml+xml",
    title: current.title ?? resource.title,
    locations: {
      progression: sameAsCurrent ? (current.locations.progression ?? 0) : 0,
      position:
        sameAsCurrent && current.locations.position
          ? current.locations.position
          : resourceIndex + 1,
      totalProgression: sameAsCurrent
        ? current.locations.totalProgression
        : undefined,
      cssSelector,
    },
    text: {
      highlight: selectedText,
      ...context,
    },
  }

  const contextMenu = contextMenuAtFramePoint(
    wnd,
    frame.iframe,
    container,
    contextPoint,
  )
  return { locator, contextMenu, window: wnd }
}

export function clearEpubTextSelection(
  selection: EpubAnnotationSelection,
): void {
  selection.window.getSelection()?.removeAllRanges()
}
