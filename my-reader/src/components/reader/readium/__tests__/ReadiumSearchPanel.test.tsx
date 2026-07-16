import "@/i18n"
import type { ReaderLocator, ReaderTocItem } from "@my-reader/tools/reader-toc"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ReadiumSearchPanel } from "../ReadiumSearchPanel"

function locator(
  locations: Partial<NonNullable<ReaderLocator["locations"]>> = {},
): ReaderLocator {
  return {
    href: "OPS/chapter.xhtml",
    type: "application/xhtml+xml",
    locations: { progression: 0, ...locations },
    text: {
      before: "before ",
      highlight: "needle",
      after: " after",
    },
  }
}

const positions = [
  locator({ progression: 0.2, position: 12 }),
  locator({ progression: 0.6, position: 13 }),
]
const toc: ReaderTocItem[] = [
  {
    id: "chapter",
    label: "Resolved chapter",
    pageIndex: 0,
    href: "chapter.xhtml",
    locator: positions[0],
  },
]

const baseProps = {
  visible: true,
  query: "needle",
  locators: [locator({ progression: 0.65 })],
  toc,
  positions,
  loading: false,
  done: true,
  error: null,
  status: "results" as const,
  activeLocator: null,
  onQueryChange: vi.fn(),
  onSearch: vi.fn(),
  onClear: vi.fn(),
  onLoadMore: vi.fn(),
  onSelect: vi.fn(),
  onClose: vi.fn(),
}

describe("ReadiumSearchPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal(
      "IntersectionObserver",
      class IntersectionObserverMock {
        constructor(private readonly callback: IntersectionObserverCallback) {}

        observe(target: Element) {
          this.callback(
            [{ isIntersecting: true, target } as IntersectionObserverEntry],
            this as unknown as IntersectionObserver,
          )
        }

        disconnect() {}
        unobserve() {}
        takeRecords() {
          return []
        }
        root = null
        rootMargin = ""
        thresholds = []
      },
    )
  })

  afterEach(() => vi.unstubAllGlobals())

  it("should expose only the app clear action when the query is not empty", () => {
    render(<ReadiumSearchPanel {...baseProps} />)

    expect(screen.getByRole("searchbox")).toHaveAttribute("type", "text")
    expect(screen.getAllByRole("button", { name: "清除搜索" })).toHaveLength(1)
  })

  it("should render result metadata and return the locator when selected", () => {
    const onSelect = vi.fn()
    render(<ReadiumSearchPanel {...baseProps} onSelect={onSelect} />)

    expect(screen.getByText("Resolved chapter")).toBeInTheDocument()
    expect(screen.getByText("13")).toBeInTheDocument()
    const highlight = screen.getByText("needle")
    expect(highlight.tagName).toBe("MARK")

    fireEvent.click(screen.getByRole("button", { name: /Resolved chapter/ }))
    expect(onSelect).toHaveBeenCalledWith(baseProps.locators[0])
  })

  it("should load the next page automatically when the end sentinel is visible", async () => {
    const onLoadMore = vi.fn()
    render(
      <ReadiumSearchPanel
        {...baseProps}
        done={false}
        onLoadMore={onLoadMore}
      />,
    )

    await waitFor(() => expect(onLoadMore).toHaveBeenCalledTimes(1))
    expect(
      screen.queryByRole("button", { name: "加载更多" }),
    ).not.toBeInTheDocument()
  })

  it("should show the empty state component when search has not started", () => {
    render(
      <ReadiumSearchPanel
        {...baseProps}
        query="draft query"
        locators={[]}
        status="idle"
      />,
    )

    expect(screen.getByText("搜索本书内容")).toBeInTheDocument()
    expect(
      screen.getByText("输入关键词或短语，然后按回车键"),
    ).toBeInTheDocument()
    expect(screen.queryByText("没有找到匹配内容")).not.toBeInTheDocument()
  })

  it("should show the empty state component when search has no results", () => {
    render(<ReadiumSearchPanel {...baseProps} locators={[]} status="empty" />)

    expect(screen.getByText("没有找到匹配内容")).toBeInTheDocument()
    expect(screen.getByText("请尝试其他关键词或短语")).toBeInTheDocument()
  })

  it("should show the empty state component and retry when search fails", () => {
    const onSearch = vi.fn()
    render(
      <ReadiumSearchPanel
        {...baseProps}
        locators={[]}
        error={new Error("search failed")}
        status="error"
        onSearch={onSearch}
      />,
    )

    expect(screen.getByRole("alert")).toBeInTheDocument()
    expect(screen.getByText("搜索失败，请重试")).toBeInTheDocument()
    expect(screen.getByText("请稍后重新搜索")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "重试" }))
    expect(onSearch).toHaveBeenCalledTimes(1)
  })
})
