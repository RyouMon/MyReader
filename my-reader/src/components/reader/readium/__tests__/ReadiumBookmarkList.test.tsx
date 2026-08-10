import "@/i18n"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ReadiumBookmarkList } from "../ReadiumBookmarkList"

const bookmarks = [
  {
    id: "bookmark-1",
    locatorKey: "v1:position:8",
    locator: {
      href: "chapter-8.xhtml",
      type: "application/xhtml+xml",
      title: "第八章",
      locations: { progression: 0.4, position: 8 },
    },
    createdAt: new Date(2026, 6, 9, 12).getTime(),
  },
  {
    id: "bookmark-2",
    locatorKey: "v1:position:9",
    locator: {
      href: "chapter-9.xhtml",
      type: "application/xhtml+xml",
      title: "第九章",
      locations: { progression: 0.5, position: 9 },
    },
    createdAt: new Date(2026, 6, 10, 12).getTime(),
  },
]

describe("ReadiumBookmarkList", () => {
  it("should navigate to a bookmark and expose deletion from its context menu", async () => {
    const onSelect = vi.fn()
    const onDelete = vi.fn()
    render(
      <ReadiumBookmarkList
        bookmarks={[bookmarks[0]]}
        onSelect={onSelect}
        onDelete={onDelete}
      />,
    )

    expect(screen.getByText("第八章")).toBeInTheDocument()
    expect(screen.getByText("8")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /第八章/ }))
    expect(onSelect).toHaveBeenCalledWith(bookmarks[0])

    fireEvent.contextMenu(screen.getByText("第八章"))
    fireEvent.click(await screen.findByRole("menuitem", { name: "删除" }))
    expect(onDelete).toHaveBeenCalledWith(bookmarks[0])
  })

  it("should select bookmarks and delete the selection", async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined)
    render(<ReadiumBookmarkList bookmarks={bookmarks} onDelete={onDelete} />)

    fireEvent.contextMenu(screen.getByText("第八章"))
    fireEvent.click(await screen.findByRole("menuitem", { name: "选择" }))
    fireEvent.click(screen.getByRole("button", { name: /第九章/ }))
    expect(screen.getByText("已选择 2 个书签")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "删除所选书签" }))

    await waitFor(() => expect(onDelete).toHaveBeenCalledTimes(2))
    expect(onDelete).toHaveBeenNthCalledWith(1, bookmarks[0])
    expect(onDelete).toHaveBeenNthCalledWith(2, bookmarks[1])
  })

  it("should show the bookmark empty state", () => {
    render(<ReadiumBookmarkList bookmarks={[]} />)
    expect(screen.getByText("还没有书签")).toBeInTheDocument()
    expect(screen.getByText("请在阅读时添加书签。")).toBeInTheDocument()
  })
})
