import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { PdfNavigator } from "../PdfNavigator"

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe("PdfNavigator", () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn(),
      restore: vi.fn(),
      save: vi.fn(),
      translate: vi.fn(),
    } as unknown as CanvasRenderingContext2D)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("should clamp the user zoom scale when it exceeds the supported range", () => {
    const navigator = new PdfNavigator("book.pdf")

    navigator.renderScale = 0.5
    expect(navigator.renderScale).toBe(1)

    navigator.renderScale = 10
    expect(navigator.renderScale).toBe(4)
  })

  it("should separate output resolution from display size when rendering a zoomed page", async () => {
    const navigator = new PdfNavigator("book.pdf")
    const page = {
      getViewport: vi.fn(({ scale }: { scale: number }) => ({
        width: 100 * scale,
        height: 200 * scale,
      })),
      render: vi.fn(() => ({ promise: Promise.resolve() })),
    }
    Reflect.set(navigator, "pdf", {})
    Reflect.set(navigator, "_totalPages", 1)
    Reflect.get(navigator, "pageCache").set(1, page)
    const canvas = document.createElement("canvas")
    navigator.renderScale = 2
    await navigator.renderPage(canvas, 800, 600)

    expect(canvas.width).toBe(750)
    expect(canvas.height).toBe(1500)
    expect(canvas.style.width).toBe("600px")
    expect(canvas.style.height).toBe("1200px")
  })

  it("should preserve fitted display size when rendering a high-resolution pager canvas", async () => {
    const navigator = new PdfNavigator("book.pdf")
    const page = {
      getViewport: vi.fn(({ scale }: { scale: number }) => ({
        width: 100 * scale,
        height: 200 * scale,
      })),
      render: vi.fn(() => ({ promise: Promise.resolve() })),
    }
    Reflect.set(navigator, "pdf", {})
    Reflect.set(navigator, "_totalPages", 1)
    Reflect.get(navigator, "pageCache").set(1, page)
    const canvas = document.createElement("canvas")
    navigator.renderScale = 2
    await navigator.renderPageAt(canvas, 1, 800, 600, "ltr", true)

    expect(canvas.width).toBe(750)
    expect(canvas.height).toBe(1500)
    expect(canvas.style.width).toBe("300px")
    expect(canvas.style.height).toBe("600px")
  })

  it("should reuse a completed canvas render when its configuration is unchanged", async () => {
    const navigator = new PdfNavigator("book.pdf")
    const page = {
      getViewport: vi.fn(({ scale }: { scale: number }) => ({
        width: 100 * scale,
        height: 200 * scale,
      })),
      render: vi.fn(() => ({ promise: Promise.resolve() })),
    }
    Reflect.set(navigator, "pdf", {})
    Reflect.set(navigator, "_totalPages", 1)
    Reflect.get(navigator, "pageCache").set(1, page)
    const canvas = document.createElement("canvas")
    await navigator.renderPageAt(canvas, 1, 800, 600, "ltr", true)
    await navigator.renderPageAt(canvas, 1, 800, 600, "ltr", true)

    expect(page.render).toHaveBeenCalledTimes(1)
  })

  it("should keep the previous bitmap visible until a replacement render completes", async () => {
    const navigator = new PdfNavigator("book.pdf")
    const renderStarted = deferred()
    const replacement = deferred()
    const page = {
      getViewport: vi.fn(({ scale }: { scale: number }) => ({
        width: 100 * scale,
        height: 200 * scale,
      })),
      render: vi.fn(() => {
        renderStarted.resolve()
        return { promise: replacement.promise }
      }),
    }
    Reflect.set(navigator, "pdf", {})
    Reflect.set(navigator, "_totalPages", 1)
    Reflect.get(navigator, "pageCache").set(1, page)
    const canvas = document.createElement("canvas")
    canvas.width = 320
    canvas.height = 480

    const pending = navigator.renderPageAt(canvas, 1, 800, 600, "ltr", true)
    await renderStarted.promise

    expect(canvas.width).toBe(320)
    expect(canvas.height).toBe(480)

    replacement.resolve()
    await pending
    expect(canvas.width).toBe(375)
    expect(canvas.height).toBe(750)
  })

  it("should reverse a spread visually when reading from right to left", () => {
    const navigator = new PdfNavigator("book.pdf")
    Reflect.set(navigator, "_currentPage", 2)
    Reflect.set(navigator, "_totalPages", 5)
    navigator.spreadMode = "double"

    expect(navigator.getSpreadPagesInReadingOrder(1200, 800, "ltr")).toEqual([
      2, 3,
    ])
    expect(navigator.getSpreadPagesInReadingOrder(1200, 800, "rtl")).toEqual([
      3, 2,
    ])
  })

  it("should resolve adjacent spread starts without changing the current page", () => {
    const navigator = new PdfNavigator("book.pdf")
    Reflect.set(navigator, "_currentPage", 2)
    Reflect.set(navigator, "_totalPages", 8)
    navigator.spreadMode = "double"

    expect(navigator.adjacentPage(-1)).toBe(1)
    expect(navigator.adjacentPage(1)).toBe(4)
    expect(navigator.currentPage).toBe(2)
  })

  it("should serialize renders when the same canvas receives overlapping requests", async () => {
    const navigator = new PdfNavigator("book.pdf")
    const firstRender = deferred()
    const firstRenderStarted = deferred()
    let activeRenders = 0
    let maxActiveRenders = 0
    let renderCalls = 0
    const page = {
      getViewport: vi.fn(({ scale }: { scale: number }) => ({
        width: 100 * scale,
        height: 200 * scale,
      })),
      render: vi.fn(() => {
        renderCalls += 1
        activeRenders += 1
        maxActiveRenders = Math.max(maxActiveRenders, activeRenders)
        if (renderCalls === 1) firstRenderStarted.resolve()
        const promise =
          renderCalls === 1 ? firstRender.promise : Promise.resolve()
        return {
          promise: promise.finally(() => {
            activeRenders -= 1
          }),
        }
      }),
    }
    Reflect.set(navigator, "pdf", {})
    Reflect.set(navigator, "_totalPages", 1)
    Reflect.get(navigator, "pageCache").set(1, page)
    const canvas = document.createElement("canvas")
    const first = navigator.renderPage(canvas, 800, 600)
    await firstRenderStarted.promise
    const second = navigator.renderPage(canvas, 600, 800)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(page.render).toHaveBeenCalledTimes(1)

    firstRender.resolve()
    await Promise.all([first, second])
    expect(page.render).toHaveBeenCalledTimes(2)
    expect(maxActiveRenders).toBe(1)
  })
})
