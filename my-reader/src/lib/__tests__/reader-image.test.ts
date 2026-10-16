import { afterEach, describe, expect, it, vi } from "vitest"
import {
  epubPageImages,
  divinaPageImages,
  pdfPageImages,
  imageSourceAtEvent,
  readerImagePayload,
} from "../reader-image"

const book = { title: "山海", authors: ["张三"] }

describe("reader image exports", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    document.body.innerHTML = ""
  })

  it("shares exactly the CBZ cover or visible spread using the original resource URLs", () => {
    const items = ["cover.jpg", "2.webp", "3.png"].map((href) => ({
      href: `blob:https://reader.test/${href}`,
    }))
    expect(divinaPageImages(items, [1])).toEqual([
      { url: items[0].href, position: 1 },
    ])
    expect(divinaPageImages(items, [2, 3])).toEqual([
      { url: items[1].href, position: 2 },
      { url: items[2].href, position: 3 },
    ])
    expect(() => divinaPageImages(items, [3, 4])).toThrow("READER_NOT_READY")
  })

  it.each([
    [1],
    [2, 3],
  ])("renders each requested PDF page separately for sharing: %j", async (...pages) => {
    const container = document.createElement("div")
    const renderSinglePage = vi.fn(
      async (canvas: HTMLCanvasElement, page: number) => {
        canvas.dataset.page = String(page)
      },
    )
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation(
      function (this: HTMLCanvasElement) {
        return `data:image/png;base64,page-${this.dataset.page}`
      },
    )
    const images = await pdfPageImages({ renderSinglePage }, container, pages)
    expect(images).toEqual(
      pages.map((position) => ({
        name: "page.png",
        position,
        data: `page-${position}`,
      })),
    )
    expect(renderSinglePage.mock.calls.map(([, page]) => page)).toEqual(pages)
    expect(
      new Set(renderSinglePage.mock.calls.map(([canvas]) => canvas)).size,
    ).toBe(pages.length)
  })

  it("PDF scrolling shares intersecting pages and excludes preloaded canvases", async () => {
    const container = document.createElement("div")
    vi.spyOn(container, "getBoundingClientRect").mockReturnValue({
      top: 100,
      bottom: 500,
    } as DOMRect)
    for (const [index, [top, bottom]] of [
      [0, 100],
      [50, 250],
      [250, 600],
      [500, 700],
    ].entries()) {
      const canvas = document.createElement("canvas")
      canvas.dataset.pdfPage = String(index + 1)
      vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
        top,
        bottom,
      } as DOMRect)
      container.append(canvas)
    }
    const renderSinglePage = vi.fn(async () => {})
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
      "data:image/png;base64,pixels",
    )
    expect(
      (await pdfPageImages({ renderSinglePage }, container, null)).map(
        (image) => image.position,
      ),
    ).toEqual([2, 3])
    renderSinglePage.mockRejectedValueOnce(new Error("PDF render failed"))
    await expect(
      pdfPageImages({ renderSinglePage }, container, [2, 3]),
    ).rejects.toThrow("PDF render failed")
  })

  it.each([
    { opaque: [10, 11, 16, 17], size: [2, 2], offset: [-4, -1] },
    {
      opaque: Array.from({ length: 24 }, (_, i) => i),
      size: [6, 4],
      offset: null,
    },
    { opaque: [], size: [6, 4], offset: null },
  ])("copies PDF image pixels without transparent spread padding: $size", ({
    opaque,
    size,
    offset,
  }) => {
    const pixels = new Uint8ClampedArray(6 * 4 * 4)
    for (const pixel of opaque) pixels.set([23, 45, 67, 255], pixel * 4)
    const drawImage = vi.fn()
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      getImageData: () => ({ data: pixels }),
      drawImage,
    } as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation(
      function (this: HTMLCanvasElement) {
        return `data:image/png;base64,${this.width}x${this.height}`
      },
    )
    document.body.innerHTML =
      '<div data-reader-page="3"><div class="textLayerImages"><canvas width="6" height="4"></canvas></div></div>'
    const canvas = document.querySelector("canvas")!
    expect(
      imageSourceAtEvent({ target: canvas } as unknown as MouseEvent),
    ).toEqual({ name: "image.png", position: 3, data: size.join("x") })
    if (offset)
      expect(drawImage).toHaveBeenCalledExactlyOnceWith(canvas, ...offset)
    else expect(drawImage).not.toHaveBeenCalled()
  })

  it("keeps native capture bounds and page-based filenames without fetching pixels", async () => {
    const fetch = vi.fn()
    vi.stubGlobal("fetch", fetch)
    const capture = { x: 100, y: 20, width: 300, height: 600 }
    expect(
      await readerImagePayload(
        { name: "page.png", capture, position: 7 },
        { title: "山海" },
      ),
    ).toEqual({ name: "山海-7.png", data: null, capture })
    expect(fetch).not.toHaveBeenCalled()
  })

  it("exports original bytes with the book and page filename", async () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0x00, 0xfe, 0xff, 0xd9])
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        blob: async () => new Blob([bytes], { type: "image/jpeg" }),
      }),
    )
    const payload = await readerImagePayload(
      {
        url: "https://readium.test/book/%E6%8F%92%E5%9B%BE.jpg",
        position: 3,
      },
      book,
    )
    expect(payload).toEqual({
      name: "张三-山海-3.jpg",
      data: "/9gA/v/Z",
      capture: null,
    })
    vi.unstubAllGlobals()
  })

  it("only intercepts actual image targets and resolves relative sources", () => {
    const document = window.document.implementation.createHTMLDocument()
    document.head.innerHTML =
      '<base href="https://readium.test/book/chapter/one.xhtml">'
    document.body.innerHTML = '<p>Text</p><img src="../images/cover.jpg">'
    const source = (target: Element | null) =>
      imageSourceAtEvent({ target } as unknown as MouseEvent)
    expect(source(document.querySelector("p"))).toBeNull()
    expect(source(document.querySelector("img"))).toEqual({
      url: "https://readium.test/book/images/cover.jpg",
    })
  })

  it("does not replace a missing original with a rendered screenshot", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 404 }),
    )
    await expect(
      readerImagePayload({ url: "https://readium.test/missing.jpg" }, book),
    ).rejects.toThrow("IMAGE_READ_FAILED: 404")
    vi.unstubAllGlobals()
  })

  it("uses the clicked image's page in a spread, including the right page", async () => {
    document.body.innerHTML =
      '<img data-reader-page="2" src="https://readium.test/left.png"><img data-reader-page="3" src="https://readium.test/right.png">'
    const source = imageSourceAtEvent({
      target: document.querySelectorAll("img")[1],
    } as unknown as MouseEvent)
    expect(source).toMatchObject({
      position: 3,
      url: "https://readium.test/right.png",
    })
    document.body.innerHTML = ""
  })

  it("exports both EPUB columns while excluding preloaded offscreen frames", () => {
    const container = document.createElement("div")
    document.body.append(container)
    const frame = document.createElement("iframe")
    const preload = document.createElement("iframe")
    container.append(frame, preload)
    const rect = (x: number) => ({
      x,
      y: 0,
      left: x,
      top: 0,
      right: x + 800,
      bottom: 600,
      width: 800,
      height: 600,
      toJSON: () => ({}),
    })
    vi.spyOn(container, "getBoundingClientRect").mockReturnValue(rect(0))
    vi.spyOn(frame, "getBoundingClientRect").mockReturnValue(rect(0))
    vi.spyOn(preload, "getBoundingClientRect").mockReturnValue(rect(800))
    frame.contentDocument!.documentElement.style.setProperty(
      "--RS__colCount",
      "2",
    )
    const pages = epubPageImages(container, 4, 5)
    expect(pages).toHaveLength(2)
    expect(pages.map((page) => page.position)).toEqual([4, 5])
    expect(pages.map((page) => "capture" in page && page.capture)).toEqual([
      { x: 0, y: 0, width: 400, height: 600 },
      { x: 400, y: 0, width: 400, height: 600 },
    ])
    container.remove()
  })

  it("keeps a blob resource's image format when its URL has no filename", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        blob: async () => new Blob(["original"], { type: "image/webp" }),
      }),
    )
    const payload = await readerImagePayload(
      {
        url: "blob:https://readium.test/image-id",
      },
      book,
    )
    expect(payload.name).toBe("张三-山海-1.webp")
    expect(payload.data).toBe(btoa("original"))
    vi.unstubAllGlobals()
  })
})
