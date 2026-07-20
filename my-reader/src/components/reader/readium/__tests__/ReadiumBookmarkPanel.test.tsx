import "@/i18n"
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ReadiumBookmarkPanel } from "../ReadiumBookmarkPanel"

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

describe("ReadiumBookmarkPanel", () => {
  it("should expose bookmarks from a dedicated panel", () => {
    const onSelect = vi.fn()
    render(
      <ReadiumBookmarkPanel
        visible
        bookmarks={[bookmark]}
        onSelect={onSelect}
      />,
    )

    expect(screen.getByText("书签")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /第八章/ }))
    expect(onSelect).toHaveBeenCalledWith(bookmark)
  })

  it("should show the bookmark loading error and retry action", () => {
    const onRetry = vi.fn()
    render(
      <ReadiumBookmarkPanel
        visible
        bookmarks={[]}
        error="offline"
        onRetry={onRetry}
      />,
    )

    expect(screen.getByRole("alert")).toHaveTextContent("offline")
    fireEvent.click(screen.getByRole("button", { name: "重试" }))
    expect(onRetry).toHaveBeenCalledOnce()
  })
})
