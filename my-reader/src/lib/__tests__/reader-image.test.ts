import { describe, expect, it, vi } from "vitest"
import {
  epubPageImages,
  imageSourceAtEvent,
  readerImagePayload,
} from "../reader-image"

const book = { title: "山海", authors: ["张三"] }

describe("reader image exports", () => {
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
