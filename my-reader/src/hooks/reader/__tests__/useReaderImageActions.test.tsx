import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
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
  beforeEach(() => vi.clearAllMocks())

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
})
