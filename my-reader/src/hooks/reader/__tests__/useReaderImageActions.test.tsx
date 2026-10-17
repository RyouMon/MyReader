import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { toast } from "sonner"
import { api } from "@/lib/tauri-api"
import { useReaderImageActions } from "../useReaderImageActions"

vi.mock("@/lib/platform", () => ({
  isMacPlatform: () => true,
  isWindowsPlatform: () => false,
}))
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("@/lib/tauri-api", () => ({
  api: { readerImageAction: vi.fn(), shareReaderImages: vi.fn() },
}))

describe("reader image actions", () => {
  beforeEach(() => vi.resetAllMocks())
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    document.body.innerHTML = ""
  })

  it("restores capture chrome and allows retry after a native export fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0)
      return 0
    })
    const root = document.createElement("div")
    document.body.append(root)
    const capture = { x: 0, y: 0, width: 100, height: 200 }
    vi.mocked(api.readerImageAction)
      .mockImplementationOnce(async () => {
        expect(
          document.documentElement.classList.contains("reader-image-capture"),
        ).toBe(true)
        throw new Error("Snapshot failed")
      })
      .mockResolvedValue("/cache/page.png")
    const { result } = renderHook(() =>
      useReaderImageActions(root, { title: "山海" }, 2),
    )
    const source = async () => [{ capture, name: "page.png", position: 2 }]
    await act(() => result.current.run("prepareShare", source))
    expect(
      document.documentElement.classList.contains("reader-image-capture"),
    ).toBe(false)
    expect(result.current.busy).toBe(false)
    expect(api.shareReaderImages).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledExactlyOnceWith(
      "reader.imageActionFailed",
    )
    await act(() => result.current.run("prepareShare", source))
    expect(api.shareReaderImages).toHaveBeenCalledExactlyOnceWith([
      "/cache/page.png",
    ])
  })

  it("does not open a partial share sheet when a second visible page fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    vi.mocked(api.readerImageAction)
      .mockResolvedValueOnce("/cache/first.png")
      .mockRejectedValueOnce(new Error("Second page unavailable"))
    const { result } = renderHook(() =>
      useReaderImageActions(null, { title: "山海" }, 2),
    )
    await act(() =>
      result.current.run("prepareShare", async () =>
        [2, 3].map((position) => ({
          name: "page.png",
          data: "bytes",
          position,
        })),
      ),
    )
    expect(api.shareReaderImages).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledOnce()
    expect(result.current.busy).toBe(false)
  })

  it("serializes repeated actions and treats save cancellation as a normal outcome", async () => {
    let finish!: (value: string | null) => void
    vi.mocked(api.readerImageAction).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const { result } = renderHook(() =>
      useReaderImageActions(null, { title: "山海" }, 1),
    )
    const source = vi.fn(async () => [{ name: "page.png", data: "bytes" }])
    let pending!: Promise<void>
    await act(async () => {
      pending = result.current.run("save", source)
      await Promise.resolve()
    })
    expect(result.current.busy).toBe(true)
    await act(() => result.current.run("copy", source))
    expect(source).toHaveBeenCalledOnce()
    await act(async () => {
      finish(null)
      await pending
    })
    expect(toast.success).not.toHaveBeenCalled()
    expect(toast.error).not.toHaveBeenCalled()
    expect(result.current.busy).toBe(false)
  })

  it.each([
    "copy",
    "save",
  ] as const)("confirms %s only after the native operation succeeds", async (action) => {
    vi.mocked(api.readerImageAction).mockResolvedValue("done")
    const { result } = renderHook(() =>
      useReaderImageActions(null, { title: "山海" }, 1),
    )
    await act(() =>
      result.current.run(action, async () => [
        { name: "image.jpg", data: "original", position: 4 },
      ]),
    )
    expect(api.readerImageAction).toHaveBeenCalledExactlyOnceWith(
      action,
      "山海-4.jpg",
      "original",
      null,
    )
    expect(toast.success).toHaveBeenCalledExactlyOnceWith(
      action === "copy" ? "reader.imageCopied" : "reader.imageSaved",
    )
  })

  it("reports an empty current page instead of sharing stale content", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const { result } = renderHook(() =>
      useReaderImageActions(null, { title: "山海" }, 1),
    )
    await act(() => result.current.run("prepareShare", async () => []))
    expect(api.readerImageAction).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledOnce()
  })

  it.each([
    [1],
    [2, 3],
  ])("shares exactly the visible pages %j in one system panel", async (...pages) => {
    vi.mocked(api.readerImageAction).mockImplementation(
      async (_action, name) => `/cache/${name}`,
    )
    const { result } = renderHook(() =>
      useReaderImageActions(
        null,
        { title: "山海", authors: ["张三"] },
        pages[0],
      ),
    )
    await act(() =>
      result.current.run("prepareShare", async () =>
        pages.map((position) => ({
          name: "page.png",
          data: `page-${position}`,
          position,
        })),
      ),
    )
    expect(api.readerImageAction).toHaveBeenCalledTimes(pages.length)
    for (const page of pages)
      expect(api.readerImageAction).toHaveBeenCalledWith(
        "prepareShare",
        `张三-山海-${page}.png`,
        `page-${page}`,
        null,
      )
    expect(api.shareReaderImages).toHaveBeenCalledExactlyOnceWith(
      pages.map((page) => `/cache/张三-山海-${page}.png`),
    )
  })

  it("keeps the clicked page when the context menu opens on the second image", () => {
    const root = document.createElement("div")
    root.innerHTML =
      '<img data-reader-page="3" src="https://readium.test/page3.jpg">'
    document.body.append(root)
    const { result, unmount } = renderHook(() =>
      useReaderImageActions(root, { title: "山海" }, 2),
    )
    act(() => {
      root.firstElementChild!.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
      )
    })
    expect(result.current.target?.source.position).toBe(3)
    unmount()
    root.remove()
  })

  it("binds newly loaded EPUB frames and releases their image menu handlers on close", async () => {
    const root = document.createElement("div")
    document.body.append(root)
    const { result, unmount } = renderHook(() =>
      useReaderImageActions(root, { title: "山海" }, 42),
    )
    const frame = document.createElement("iframe")
    await act(async () => {
      root.append(frame)
      frame.contentDocument!.body.innerHTML =
        '<img src="https://reader.test/original.jpg">'
      frame.dispatchEvent(new Event("load"))
    })
    vi.spyOn(frame, "getBoundingClientRect").mockReturnValue(
      new DOMRect(40, 80, 300, 400),
    )
    const image = frame.contentDocument!.querySelector("img")!
    const menu = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: 12,
      clientY: 25,
    })
    act(() => {
      image.dispatchEvent(menu)
    })
    expect(menu.defaultPrevented).toBe(true)
    expect(result.current.target).toEqual({
      source: { url: "https://reader.test/original.jpg", position: 42 },
      x: 52,
      y: 105,
    })
    unmount()
    const afterClose = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
    })
    image.dispatchEvent(afterClose)
    expect(afterClose.defaultPrevented).toBe(false)
  })
})
