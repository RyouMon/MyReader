import { readerAnnotationTint } from "@my-reader/tools/reader-annotations"
import readerNoteMarkerElementTemplate from "@my-reader/tools/reader-note-marker/reader-note-marker.html?raw"
import type { EpubNavigator } from "@readium/navigator"
import { Locator, LocatorLocations } from "@readium/shared"
import { describe, expect, it, vi } from "vitest"
import {
  applyEpubAnnotations,
  connectEpubAnnotationClickBridge,
  createEpubAnnotationSelection,
  epubAnnotationMatchesSelection,
  suppressEpubTextSelectionContextMenu,
} from "../epubAnnotations"

function createNoteMarkerFixture() {
  const container = document.createElement("div")
  const iframe = document.createElement("iframe")
  container.appendChild(iframe)
  document.body.appendChild(container)
  const wnd = iframe.contentWindow!
  const frameWindow = wnd as Window & typeof globalThis
  const paragraph = wnd.document.createElement("p")
  paragraph.id = "chapter"
  paragraph.textContent = "Before selected after"
  paragraph.style.direction = "rtl"
  wnd.document.body.appendChild(paragraph)
  vi.spyOn(wnd, "getSelection").mockReturnValue({
    isCollapsed: true,
    toString: () => "",
  } as unknown as Selection)
  const rangeDescriptor = Object.getOwnPropertyDescriptor(
    frameWindow.Range.prototype,
    "getClientRects",
  )
  Object.defineProperty(frameWindow.Range.prototype, "getClientRects", {
    configurable: true,
    value: () => [new DOMRect(20, 30, 64, 18), new DOMRect(20, 60, 80, 18)],
  })
  vi.spyOn(iframe, "getBoundingClientRect").mockReturnValue(
    new DOMRect(100, 50, 400, 600),
  )
  vi.spyOn(container, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 0, 800, 700),
  )
  const annotation = {
    id: "annotation-1",
    color: "green" as const,
    note: "A note",
    locator: {
      href: iframe.contentDocument!.baseURI,
      type: "application/xhtml+xml",
      locations: { progression: 0, cssSelector: "#chapter" },
      text: {
        highlight: "selected",
        before: "Before",
        after: "after",
      },
    },
  }
  const send = vi.fn()
  const navigator = {
    _cframes: [{ source: wnd.location.href, iframe, msg: { send } }],
  } as unknown as EpubNavigator

  return {
    annotation,
    container,
    frameWindow,
    iframe,
    navigator,
    paragraph,
    wnd,
    cleanup: () => {
      if (rangeDescriptor) {
        Object.defineProperty(
          frameWindow.Range.prototype,
          "getClientRects",
          rangeDescriptor,
        )
      } else {
        Reflect.deleteProperty(frameWindow.Range.prototype, "getClientRects")
      }
      container.remove()
    },
  }
}

describe("EPUB annotation selections", () => {
  it("should parse the note marker template as XHTML", () => {
    const parsed = new DOMParser().parseFromString(
      readerNoteMarkerElementTemplate,
      "application/xhtml+xml",
    )

    expect(parsed.querySelector("parsererror")).toBeNull()
  })

  it("should suppress the browser context menu when iframe text is selected", () => {
    const iframe = document.createElement("iframe")
    document.body.appendChild(iframe)
    const wnd = iframe.contentWindow!
    const doc = wnd.document
    vi.spyOn(wnd, "getSelection").mockReturnValue({
      isCollapsed: false,
      rangeCount: 1,
      toString: () => "Selected text",
    } as unknown as Selection)
    const disconnect = suppressEpubTextSelectionContextMenu(wnd)

    const event = new MouseEvent("contextmenu", {
      cancelable: true,
    })
    doc.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)

    disconnect()
    const afterDisconnect = new MouseEvent("contextmenu", { cancelable: true })
    doc.dispatchEvent(afterDisconnect)
    expect(afterDisconnect.defaultPrevented).toBe(false)
    iframe.remove()
  })

  it("should preserve the browser context menu without an iframe selection", () => {
    const iframe = document.createElement("iframe")
    document.body.appendChild(iframe)
    const wnd = iframe.contentWindow!
    const doc = wnd.document
    vi.spyOn(wnd, "getSelection").mockReturnValue({
      isCollapsed: true,
      rangeCount: 1,
      toString: () => "",
    } as unknown as Selection)
    suppressEpubTextSelectionContextMenu(wnd)

    const event = new MouseEvent("contextmenu", { cancelable: true })
    doc.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(false)
    iframe.remove()
  })

  it("should resolve the annotation resource when the frame source is a blob URL", () => {
    const originalPath = `${window.location.pathname}${window.location.search}`
    window.history.replaceState(null, "", "/read/3?format=EPUB")
    const container = document.createElement("div")
    const decoyIframe = document.createElement("iframe")
    const iframe = document.createElement("iframe")
    container.appendChild(decoyIframe)
    container.appendChild(iframe)
    document.body.appendChild(container)
    const wnd = iframe.contentWindow!
    const base = wnd.document.createElement("base")
    base.href = "https://reader.test/books/OEBPS/Text/chapter.xhtml"
    wnd.document.head.appendChild(base)
    const paragraph = wnd.document.createElement("p")
    paragraph.id = "chapter"
    paragraph.textContent = "Before selected after"
    wnd.document.body.appendChild(paragraph)
    const textNode = paragraph.firstChild!
    const range = wnd.document.createRange()
    range.setStart(textNode, 7)
    range.setEnd(textNode, 15)
    Object.defineProperty(range, "getClientRects", {
      value: () => [new DOMRect(20, 30, 64, 18)],
    })
    const domSelection = wnd.getSelection()!
    domSelection.removeAllRanges()
    domSelection.addRange(range)
    Object.assign(wnd, {
      _readium_cssSelectorGenerator: {
        getCssSelector: () => "#chapter",
      },
    })
    vi.spyOn(iframe, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 50, 400, 600),
    )
    vi.spyOn(container, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 0, 800, 700),
    )
    const navigator = {
      _cframes: [
        { source: wnd.location.href, iframe: decoyIframe },
        { source: wnd.location.href, iframe },
      ],
      publication: {
        readingOrder: {
          items: [
            {
              href: "OEBPS/Text/chapter.xhtml",
              type: "application/xhtml+xml",
            },
          ],
        },
      },
      currentLocator: new Locator({
        href: "OEBPS/Text/chapter.xhtml",
        type: "application/xhtml+xml",
        locations: new LocatorLocations({
          progression: 0.25,
          position: 3,
          totalProgression: 0.5,
        }),
      }),
    } as unknown as EpubNavigator

    const result = createEpubAnnotationSelection(
      navigator,
      {
        text: "selected",
        x: 20,
        y: 30,
        width: 64,
        height: 18,
        targetFrameSrc: wnd.location.href,
      },
      container,
      undefined,
      wnd,
    )

    expect(result?.locator).toMatchObject({
      href: "OEBPS/Text/chapter.xhtml",
      locations: {
        progression: 0.25,
        position: 3,
        totalProgression: 0.5,
        cssSelector: "#chapter",
      },
      text: {
        highlight: "selected",
        before: "Before",
        after: "after",
      },
    })
    expect(result?.window).toBe(wnd)
    expect(result?.contextMenu.x).toBeCloseTo(100 + (52 * 400) / wnd.innerWidth)
    expect(result?.contextMenu.y).toBeCloseTo(50 + (30 * 600) / wnd.innerHeight)

    container.remove()
    window.history.replaceState(null, "", originalPath)
  })

  it("should match a reselected passage to its saved annotation", () => {
    const locator = {
      href: "OEBPS/Text/chapter.xhtml",
      type: "application/xhtml+xml",
      locations: { progression: 0.25, cssSelector: "#chapter" },
      text: {
        highlight: "selected",
        before: "Before",
        after: "after",
      },
    }

    expect(
      epubAnnotationMatchesSelection(locator, {
        ...locator,
        href: "https://reader.test/books/OEBPS/Text/chapter.xhtml",
      }),
    ).toBe(true)
    expect(
      epubAnnotationMatchesSelection(locator, {
        ...locator,
        text: { ...locator.text, highlight: "different" },
      }),
    ).toBe(false)
  })

  it("should activate a saved annotation when its highlighted text is clicked", () => {
    const container = document.createElement("div")
    const iframe = document.createElement("iframe")
    container.appendChild(iframe)
    document.body.appendChild(container)
    const wnd = iframe.contentWindow!
    const frameWindow = wnd as Window & typeof globalThis
    const paragraph = wnd.document.createElement("p")
    paragraph.id = "chapter"
    paragraph.textContent = "Before selected after"
    wnd.document.body.appendChild(paragraph)
    vi.spyOn(wnd, "getSelection").mockReturnValue({
      isCollapsed: true,
      toString: () => "",
    } as unknown as Selection)
    const rangeDescriptor = Object.getOwnPropertyDescriptor(
      frameWindow.Range.prototype,
      "getClientRects",
    )
    Object.defineProperty(frameWindow.Range.prototype, "getClientRects", {
      configurable: true,
      value: () => [new DOMRect(20, 30, 64, 18)],
    })
    vi.spyOn(iframe, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 50, 400, 600),
    )
    vi.spyOn(container, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 0, 800, 700),
    )
    const onAnnotationClick = vi.fn()
    const disconnect = connectEpubAnnotationClickBridge(wnd, {
      iframe,
      container,
      getAnnotations: () => [
        {
          id: "annotation-1",
          color: "yellow",
          locator: {
            href: iframe.contentDocument!.baseURI,
            type: "application/xhtml+xml",
            locations: { progression: 0, cssSelector: "#chapter" },
            text: {
              highlight: "selected",
              before: "Before",
              after: "after",
            },
          },
        },
      ],
      onAnnotationClick,
      onAnnotationNoteClick: vi.fn(),
      noteMarkerAccessibilityLabel: "Open note",
    })

    const click = new frameWindow.MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 52,
      clientY: 39,
    })
    paragraph.dispatchEvent(click)

    expect(click.defaultPrevented).toBe(true)
    expect(onAnnotationClick).toHaveBeenCalledTimes(1)
    const activated = onAnnotationClick.mock.calls[0][0]
    expect(activated).toMatchObject({
      locator: {
        text: { highlight: "selected" },
      },
      window: wnd,
    })
    expect(activated.contextMenu.x).toBeCloseTo(
      100 + (52 * 400) / wnd.innerWidth,
    )
    expect(activated.contextMenu.y).toBeCloseTo(
      50 + (30 * 600) / wnd.innerHeight,
    )

    disconnect()
    if (rangeDescriptor) {
      Object.defineProperty(
        frameWindow.Range.prototype,
        "getClientRects",
        rangeDescriptor,
      )
    } else {
      Reflect.deleteProperty(frameWindow.Range.prototype, "getClientRects")
    }
    iframe.remove()
  })

  it("should anchor the note marker to the upper right of the highlighted passage end", () => {
    const fixture = createNoteMarkerFixture()
    try {
      applyEpubAnnotations(fixture.navigator, [fixture.annotation], "打开笔记")
      const marker = fixture.wnd.document.querySelector<HTMLButtonElement>(
        '[data-myreader-note-id="annotation-1"]',
      )

      expect(marker).not.toBeNull()
      expect(marker).toHaveAttribute("aria-label", "打开笔记")
      expect(marker?.style.getPropertyValue("--myreader-note-color")).toBe(
        readerAnnotationTint("green"),
      )
      expect(
        marker?.querySelector(".myreader-note-marker-paper"),
      ).not.toBeNull()
      const placement = marker?.closest<HTMLElement>(
        ".myreader-note-marker-placement",
      )
      expect(placement?.style.left).toBe("20px")
      expect(placement?.style.top).toBe("60px")
      expect(placement?.style.width).toBe("80px")
      expect(placement?.style.height).toBe("18px")
      const markerStyle = fixture.wnd.document.getElementById(
        "myreader-note-marker-style",
      )
      expect(markerStyle?.textContent).toContain("max-width: none !important")
      const computedMarkerStyle = fixture.wnd.getComputedStyle(marker!)
      expect(Number.parseFloat(computedMarkerStyle.top)).toBeLessThan(0)
      expect(Number.parseFloat(computedMarkerStyle.right)).toBeLessThan(0)
      expect(computedMarkerStyle.left).toBe("auto")

      markerStyle!.textContent = "stale marker styles"
      applyEpubAnnotations(fixture.navigator, [fixture.annotation], "打开笔记")
      expect(markerStyle?.textContent).toContain("max-width: none !important")
    } finally {
      fixture.cleanup()
    }
  })

  it("should open the note only when its marker is clicked", () => {
    const fixture = createNoteMarkerFixture()
    const onAnnotationClick = vi.fn()
    const onAnnotationNoteClick = vi.fn()
    let disconnect = () => {}

    try {
      applyEpubAnnotations(fixture.navigator, [fixture.annotation], "打开笔记")
      disconnect = connectEpubAnnotationClickBridge(fixture.wnd, {
        iframe: fixture.iframe,
        container: fixture.container,
        getAnnotations: () => [fixture.annotation],
        onAnnotationClick,
        onAnnotationNoteClick,
        noteMarkerAccessibilityLabel: "打开笔记",
      })

      fixture.wnd.document
        .querySelector<HTMLButtonElement>(
          '[data-myreader-note-id="annotation-1"]',
        )
        ?.click()
      expect(onAnnotationNoteClick).toHaveBeenCalledWith("annotation-1")
      expect(onAnnotationClick).not.toHaveBeenCalled()

      const textClick = new fixture.frameWindow.MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: 52,
        clientY: 39,
      })
      fixture.paragraph.dispatchEvent(textClick)
      expect(onAnnotationClick).toHaveBeenCalledTimes(1)
    } finally {
      disconnect()
      fixture.cleanup()
    }
  })

  it("should apply a saved annotation when the frame source is a blob URL", () => {
    const iframe = document.createElement("iframe")
    document.body.appendChild(iframe)
    const base = iframe.contentDocument!.createElement("base")
    base.href = "https://reader.test/books/OEBPS/Text/chapter.xhtml"
    iframe.contentDocument!.head.appendChild(base)
    const send = vi.fn()
    const navigator = {
      _cframes: [
        { source: iframe.contentWindow!.location.href, iframe, msg: { send } },
      ],
    } as unknown as EpubNavigator

    const annotation = {
      id: "annotation-1",
      color: "yellow" as const,
      locator: {
        href: "OEBPS/Text/chapter.xhtml",
        type: "application/xhtml+xml",
        locations: { progression: 0, cssSelector: "#selection" },
        text: { highlight: "Selected text" },
      },
    }
    applyEpubAnnotations(navigator, [annotation])

    expect(send).toHaveBeenCalledTimes(6)
    expect(send).toHaveBeenCalledWith("decorate", {
      group: "annotations",
      action: "clear",
      decoration: undefined,
    })
    for (const color of ["yellow", "orange", "green", "blue"]) {
      expect(send).toHaveBeenCalledWith("decorate", {
        group: `annotations-${color}`,
        action: "clear",
        decoration: undefined,
      })
    }
    expect(send).toHaveBeenLastCalledWith(
      "decorate",
      expect.objectContaining({
        group: "annotations-yellow",
        action: "add",
        decoration: expect.objectContaining({ id: "annotation-1" }),
      }),
    )

    send.mockClear()
    applyEpubAnnotations(navigator, [
      { ...annotation, color: "orange" as const },
    ])
    expect(send).toHaveBeenCalledTimes(6)
    expect(send).toHaveBeenLastCalledWith(
      "decorate",
      expect.objectContaining({
        group: "annotations-orange",
        action: "add",
        decoration: expect.objectContaining({
          id: "annotation-1",
          style: expect.objectContaining({ tint: "#C4622D66" }),
        }),
      }),
    )
    iframe.remove()
  })
})
