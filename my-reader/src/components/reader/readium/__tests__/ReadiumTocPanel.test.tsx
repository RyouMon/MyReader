import "@/i18n"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ReadiumTocPanel } from "../ReadiumTocPanel"

describe("ReadiumTocPanel", () => {
  it("should scroll the active row into view when the table of contents opens", () => {
    const rows = [
      {
        key: "chapter-1",
        depth: 0,
        title: "第一章",
        href: "chapter-1.xhtml",
      },
      {
        key: "chapter-12",
        depth: 0,
        title: "第十二章",
        href: "chapter-12.xhtml",
      },
    ]
    const { rerender } = render(
      <ReadiumTocPanel
        visible={false}
        activeKey="chapter-12"
        rows={rows}
        onSelect={vi.fn()}
      />,
    )
    const scrollIntoView = vi.fn()
    Object.defineProperty(
      screen.getByRole("button", { name: "第十二章" }),
      "scrollIntoView",
      { configurable: true, value: scrollIntoView },
    )

    rerender(
      <ReadiumTocPanel
        visible
        activeKey="chapter-12"
        rows={rows}
        onSelect={vi.fn()}
      />,
    )

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "center" })
  })

  it("should highlight only the active row key when rows share href", () => {
    const rows = [
      {
        key: "chapter",
        depth: 0,
        title: "第三章 情绪Emotion",
        href: "OEBPS/Text/chapter.xhtml",
      },
      {
        key: "child-1",
        depth: 1,
        title: "敬畏的力量",
        href: "OEBPS/Text/chapter.xhtml",
      },
      {
        key: "child-2",
        depth: 1,
        title: "任何情感都能激发共享行为吗",
        href: "OEBPS/Text/chapter.xhtml",
      },
    ]
    const onSelect = vi.fn()
    render(
      <ReadiumTocPanel
        visible
        activeKey="child-1"
        rows={rows}
        onSelect={onSelect}
      />,
    )

    const activeRow = screen.getByRole("button", { name: "敬畏的力量" })
    expect(activeRow).toHaveAttribute("aria-current", "location")
    expect(
      screen.getByRole("button", { name: "第三章 情绪Emotion" }),
    ).not.toHaveAttribute("aria-current")

    fireEvent.click(
      screen.getByRole("button", { name: "任何情感都能激发共享行为吗" }),
    )
    expect(onSelect).toHaveBeenCalledWith(rows[2])
  })

  it("should show bookmark hierarchy and use the context menu for deletion", async () => {
    const bookmark = {
      id: "bookmark-1",
      locatorKey: "v1:position:8",
      locator: {
        href: "chapter.xhtml",
        type: "application/xhtml+xml",
        title: "第八章",
        locations: { progression: 0.4, position: 8 },
      },
      createdAt: new Date(2026, 6, 9, 12).getTime(),
    }
    const onBookmarkSelect = vi.fn()
    const onBookmarkDelete = vi.fn()
    render(
      <ReadiumTocPanel
        visible
        activeKey={null}
        rows={[]}
        bookmarks={[bookmark]}
        onSelect={vi.fn()}
        onBookmarkSelect={onBookmarkSelect}
        onBookmarkDelete={onBookmarkDelete}
      />,
    )

    fireEvent.click(screen.getByRole("tab", { name: "书签" }))
    expect(screen.getByText("第八章")).toBeInTheDocument()
    expect(screen.getByText("8")).toBeInTheDocument()
    expect(screen.getByText(/2026年7月9日.*星期四/)).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "删除书签" }),
    ).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: /第八章/ }))
    expect(onBookmarkSelect).toHaveBeenCalledWith(bookmark)

    fireEvent.contextMenu(screen.getByText("第八章"))
    fireEvent.click(await screen.findByRole("menuitem", { name: "删除" }))
    expect(onBookmarkDelete).toHaveBeenCalledWith(bookmark)
  })

  it("should use table-of-contents row states when a bookmark is current", () => {
    const bookmark = {
      id: "bookmark-1",
      locatorKey: "v1:position:8",
      locator: {
        href: "chapter.xhtml",
        type: "application/xhtml+xml",
        title: "第八章",
        locations: { progression: 0.4, position: 8 },
      },
      createdAt: new Date(2026, 6, 9, 12).getTime(),
    }

    render(
      <ReadiumTocPanel
        visible
        activeKey={null}
        activeBookmarkLocatorKey={bookmark.locatorKey}
        rows={[]}
        bookmarks={[bookmark]}
        onSelect={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole("tab", { name: "书签" }))

    const activeBookmark = screen.getByRole("button", { name: /第八章/ })
    expect(activeBookmark).toHaveClass("reader-chrome-toc-item")
    expect(activeBookmark).toHaveAttribute("aria-current", "location")
    expect(screen.getByText("第八章")).not.toHaveClass("text-reader-chrome-fg")
  })

  it("should show the resolved chapter before the position when the locator title is missing", () => {
    const bookmark = {
      id: "bookmark-1",
      locatorKey: "v1:position:71",
      locator: {
        href: "chapter.xhtml",
        type: "application/xhtml+xml",
        locations: { progression: 0.4, position: 71 },
      },
      chapterTitle: "Chapter 04 来构建节拍吧！",
      createdAt: new Date(2026, 6, 9, 12).getTime(),
    }

    render(
      <ReadiumTocPanel
        visible
        activeKey={null}
        rows={[]}
        bookmarks={[bookmark]}
        onSelect={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole("tab", { name: "书签" }))
    expect(screen.getByText("Chapter 04 来构建节拍吧！")).toBeInTheDocument()
    expect(screen.getByText("71")).toHaveClass("text-xs", "leading-5")
    expect(screen.queryByText("位置 71")).not.toBeInTheDocument()
  })

  it("should select bookmarks from the context menu and delete the selection", async () => {
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
    const onBookmarkDelete = vi.fn().mockResolvedValue(undefined)

    render(
      <ReadiumTocPanel
        visible
        activeKey={null}
        rows={[]}
        bookmarks={bookmarks}
        onSelect={vi.fn()}
        onBookmarkDelete={onBookmarkDelete}
      />,
    )

    fireEvent.click(screen.getByRole("tab", { name: "书签" }))
    fireEvent.contextMenu(screen.getByText("第八章"))
    fireEvent.click(await screen.findByRole("menuitem", { name: "选择" }))

    expect(screen.getByText("已选择 1 个书签")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /第八章/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    )

    fireEvent.click(screen.getByRole("button", { name: /第九章/ }))
    expect(screen.getByText("已选择 2 个书签")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "删除所选书签" }))

    await waitFor(() => {
      expect(onBookmarkDelete).toHaveBeenCalledTimes(2)
    })
    expect(onBookmarkDelete).toHaveBeenNthCalledWith(1, bookmarks[0])
    expect(onBookmarkDelete).toHaveBeenNthCalledWith(2, bookmarks[1])
  })

  it.each([
    {
      formatName: "PDF",
      href: "publication.pdf",
      type: "application/pdf",
      title: "Page 14",
    },
    {
      formatName: "CBZ",
      href: "page-14.jpg",
      type: "image/jpeg",
      title: "page-14.jpg",
    },
  ])("should show a localized page number as the primary $formatName label", ({
    href,
    type,
    title,
  }) => {
    render(
      <ReadiumTocPanel
        visible
        activeKey={null}
        rows={[]}
        bookmarks={[
          {
            id: "bookmark-pdf",
            locatorKey: "v1:position:14",
            locator: {
              href,
              type,
              title,
              locations: { progression: 0.4, position: 14 },
            },
            createdAt: new Date(2026, 6, 9, 12).getTime(),
          },
        ]}
        onSelect={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole("tab", { name: "书签" }))
    expect(screen.getByText("第 14 页")).toBeInTheDocument()
    expect(screen.queryByText(title)).not.toBeInTheDocument()
  })

  it("should show empty state when bookmark tab has no rows", () => {
    render(
      <ReadiumTocPanel visible activeKey={null} rows={[]} onSelect={vi.fn()} />,
    )

    fireEvent.click(screen.getByRole("tab", { name: "书签" }))
    expect(screen.getByText("还没有书签")).toBeInTheDocument()
  })

  it("should offer retry instead of empty state when bookmark loading fails", () => {
    const onBookmarksRetry = vi.fn()
    render(
      <ReadiumTocPanel
        visible
        activeKey={null}
        rows={[]}
        bookmarksError="offline"
        onBookmarksRetry={onBookmarksRetry}
        onSelect={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole("tab", { name: "书签" }))
    expect(screen.getByRole("alert")).toHaveTextContent("offline")
    expect(screen.queryByText("还没有书签")).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "重试" }))
    expect(onBookmarksRetry).toHaveBeenCalledTimes(1)
  })
})
