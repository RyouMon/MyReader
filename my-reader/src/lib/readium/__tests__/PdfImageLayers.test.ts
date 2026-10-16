import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { PdfNavigator } from "../PdfNavigator"

const { getDocument, imageLayers } = vi.hoisted(() => ({
  getDocument: vi.fn(),
  imageLayers: [] as { element: HTMLElement; canvas: HTMLCanvasElement }[],
}))
vi.mock("@/lib/platform", () => ({
  isMacPlatform: () => true,
  isWindowsPlatform: () => false,
}))
vi.mock("@/lib/pdfWorker", () => ({ ensurePdfJsWorker: vi.fn() }))
vi.mock("pdfjs-dist", () => ({
  getDocument,
  TextLayerImages: class {
    element = document.createElement("div")
    constructor(
      _index: number,
      _coordinates: Float64Array,
      _viewport: unknown,
      canvas: () => HTMLCanvasElement,
    ) {
      imageLayers.push({ element: this.element, canvas: canvas() })
    }
    render() {
      return this.element
    }
  },
}))

describe("PDF image layer lifetime", () => {
  beforeEach(() => {
    imageLayers.length = 0
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D)
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    )
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    document.body.innerHTML = ""
  })

  it.each([
    "ltr",
    "rtl",
  ] as const)("binds each spread image to its own page pixels and removes stale layers (%s)", async (direction) => {
    const rendered = new Map<number, HTMLCanvasElement>()
    const pages = [1, 2, 3].map((position) => ({
      getViewport: ({ scale }: { scale: number }) => ({
        width: 100 * scale,
        height: 150 * scale,
      }),
      imageCoordinates: new Float64Array([0, 0, 1, 1]),
      render: vi.fn(
        ({
          canvas,
          recordImages,
        }: {
          canvas: HTMLCanvasElement
          recordImages: boolean
        }) => {
          expect(recordImages).toBe(true)
          rendered.set(position, canvas)
          return { promise: Promise.resolve() }
        },
      ),
    }))
    getDocument.mockReturnValue({
      promise: Promise.resolve({
        numPages: 3,
        getPage: async (number: number) => pages[number - 1],
        loadingTask: { destroy: vi.fn() },
      }),
    })
    const navigator = new PdfNavigator("book.pdf")
    await navigator.load()
    navigator.spreadMode = "double"
    const canvas = document.createElement("canvas")
    document.body.append(canvas)
    await navigator.renderPageAt(canvas, 2, 804, 600, direction)
    expect(
      imageLayers.map(({ element }) => element.dataset.readerPage),
    ).toEqual(direction === "ltr" ? ["2", "3"] : ["3", "2"])
    for (const layer of imageLayers) {
      expect(layer.canvas).toBe(
        rendered.get(Number(layer.element.dataset.readerPage)),
      )
      expect(layer.canvas).not.toBe(canvas)
      expect(layer.canvas.width).toBeLessThan(canvas.width)
      expect(layer.element.isConnected).toBe(true)
    }
    const old = [...imageLayers]
    await navigator.renderSinglePage(canvas, 1, 400, 600)
    expect(old.every((layer) => !layer.element.isConnected)).toBe(true)
    const single = imageLayers[imageLayers.length - 1]!
    expect(single.element.dataset.readerPage).toBe("1")
    expect(single.canvas).toBe(rendered.get(1))
    await navigator.destroy()
    expect(single.element.isConnected).toBe(false)
  })
})
