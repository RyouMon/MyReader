import "@/i18n"
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ReadiumAnnotationPanel } from "../ReadiumAnnotationPanel"

const annotation = {
  id: "annotation-1",
  locator: {
    href: "chapter.xhtml",
    type: "application/xhtml+xml",
    locations: { progression: 0.2, position: 3 },
    text: { highlight: "被高亮的正文" },
  },
  excerpt: "被高亮的正文",
  note: "这里很重要",
  color: "yellow" as const,
  createdAt: new Date(2026, 6, 17, 12).getTime(),
}

describe("ReadiumAnnotationPanel", () => {
  it("should expose highlights and notes from a dedicated panel", () => {
    const onSelect = vi.fn()
    const onEdit = vi.fn()
    render(
      <ReadiumAnnotationPanel
        visible
        annotations={[annotation]}
        loading={false}
        mutating={false}
        onRetry={vi.fn()}
        onSelect={onSelect}
        onEdit={onEdit}
      />,
    )

    expect(screen.getByText("高亮和笔记")).toBeInTheDocument()
    expect(screen.getByText("这里很重要")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: /被高亮的正文/ }))
    fireEvent.click(screen.getByRole("button", { name: "编辑高亮与笔记" }))

    expect(onSelect).toHaveBeenCalledWith(annotation)
    expect(onEdit).toHaveBeenCalledWith(annotation)
  })

  it("should retry when the dedicated panel fails to load", () => {
    const onRetry = vi.fn()
    render(
      <ReadiumAnnotationPanel
        visible
        annotations={[]}
        loading={false}
        mutating={false}
        error="offline"
        onRetry={onRetry}
        onSelect={vi.fn()}
        onEdit={vi.fn()}
      />,
    )

    expect(screen.getByRole("alert")).toHaveTextContent("offline")
    fireEvent.click(screen.getByRole("button", { name: "重试" }))
    expect(onRetry).toHaveBeenCalledOnce()
  })
})
