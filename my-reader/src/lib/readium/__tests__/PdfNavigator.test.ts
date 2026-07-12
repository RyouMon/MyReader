import { describe, expect, it, vi } from "vitest"
import { PdfNavigator } from "../PdfNavigator"

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe("PdfNavigator", () => {
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
    vi.spyOn(canvas, "getContext").mockReturnValue(
      {} as CanvasRenderingContext2D,
    )

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
