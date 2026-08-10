import "@/i18n"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ReadiumAnnotationPanel } from "../ReadiumAnnotationPanel"

const annotation = {
  id: "annotation-1",
  locator: {
    href: "chapter.xhtml",
    type: "application/xhtml+xml",
    locations: { progression: 0.2, position: 3 },
    text: {
      before: "这里是高亮前的正文，",
      highlight: "被高亮的正文",
      after: "，这里是高亮后的正文。",
    },
  },
  excerpt: "被高亮的正文",
  note: "这里很重要",
  color: "yellow" as const,
  createdAt: new Date(2026, 6, 17, 12).getTime(),
}
const secondAnnotation = {
  ...annotation,
  id: "annotation-2",
  locator: {
    ...annotation.locator,
    locations: { progression: 0.3, position: 4 },
    text: { highlight: "另一段高亮正文" },
  },
  excerpt: "另一段高亮正文",
  note: null,
  color: "green" as const,
}
const longBefore =
  "这是一段很长的前文，用于验证前文不会抢占高亮内容的显示空间。"
const longHighlight =
  "这一整段较长的高亮内容必须完整显示，不能被前后的上下文裁掉"
const longAfter = "这是一段很长的后文，用于验证高亮内容会尽可能位于预览中间。"
const shortHighlight = "短句"
const longContextAnnotation = {
  ...annotation,
  id: "annotation-long-context",
  locator: {
    ...annotation.locator,
    locations: { progression: 0.4, position: 5 },
    text: {
      before: longBefore,
      highlight: longHighlight,
      after: longAfter,
    },
  },
  excerpt: longHighlight,
  note: null,
}
const shortContextAnnotation = {
  ...longContextAnnotation,
  id: "annotation-short-highlight",
  locator: {
    ...longContextAnnotation.locator,
    locations: { progression: 0.5, position: 6 },
    text: {
      before: longBefore,
      highlight: shortHighlight,
      after: longAfter,
    },
  },
  excerpt: shortHighlight,
}

describe("ReadiumAnnotationPanel", () => {
  it("should explain how to add the first highlight or note", () => {
    render(
      <ReadiumAnnotationPanel
        visible
        annotations={[]}
        loading={false}
        mutating={false}
        onRetry={vi.fn()}
        onSelect={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    )

    expect(screen.getByText("还没有高亮或笔记")).toBeInTheDocument()
    expect(
      screen.getByText("请先选中文字，再添加高亮或笔记。"),
    ).toBeInTheDocument()
  })

  it("should expose highlights and notes from a dedicated panel", () => {
    const onSelect = vi.fn()
    render(
      <ReadiumAnnotationPanel
        visible
        annotations={[annotation]}
        loading={false}
        mutating={false}
        onRetry={vi.fn()}
        onSelect={onSelect}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    )

    expect(screen.getByText("高亮和笔记")).toBeInTheDocument()
    expect(screen.getByText("这里很重要")).toBeInTheDocument()
    expect(screen.getByText("3")).toBeInTheDocument()

    const annotationButton = screen.getByRole("button", {
      name: /被高亮的正文/,
    })
    expect(annotationButton).toHaveTextContent(
      "这里是高亮前的正文，被高亮的正文，这里是高亮后的正文。",
    )
    const highlightedExcerpt = screen.getByText("被高亮的正文")
    expect(highlightedExcerpt.tagName).toBe("MARK")
    expect(highlightedExcerpt.style.backgroundColor).toBe(
      "rgba(217, 169, 40, 0.4)",
    )

    fireEvent.click(annotationButton)

    expect(onSelect).toHaveBeenCalledWith(annotation)
    expect(
      screen.queryByRole("button", { name: "编辑高亮与笔记" }),
    ).not.toBeInTheDocument()
  })

  it("should edit and delete an annotation from its context menu", async () => {
    const onEdit = vi.fn()
    const onDelete = vi.fn()
    render(
      <ReadiumAnnotationPanel
        visible
        annotations={[annotation]}
        loading={false}
        mutating={false}
        onRetry={vi.fn()}
        onSelect={vi.fn()}
        onEdit={onEdit}
        onDelete={onDelete}
      />,
    )

    fireEvent.contextMenu(screen.getByText("被高亮的正文"))
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "编辑高亮与笔记" }),
    )
    expect(onEdit).toHaveBeenCalledWith(annotation)

    fireEvent.contextMenu(screen.getByText("被高亮的正文"))
    fireEvent.click(await screen.findByRole("menuitem", { name: "删除" }))
    expect(onDelete).toHaveBeenCalledWith(annotation)
  })

  it("should expand context around short highlights and contract it around long highlights", () => {
    render(
      <ReadiumAnnotationPanel
        visible
        annotations={[longContextAnnotation, shortContextAnnotation]}
        loading={false}
        mutating={false}
        onRetry={vi.fn()}
        onSelect={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    )

    const highlightedExcerpt = screen.getByText(longHighlight)
    expect(highlightedExcerpt.tagName).toBe("MARK")
    const preview = highlightedExcerpt.parentElement?.textContent ?? ""
    const [before, after] = preview.split(longHighlight)
    expect(before).toBe(`…${longBefore.slice(-6)}`)
    expect(after).toBe(`${longAfter.slice(0, 6)}…`)

    const shortHighlightedExcerpt = screen.getByText(shortHighlight)
    const shortPreview =
      shortHighlightedExcerpt.parentElement?.textContent ?? ""
    const [shortBefore, shortAfter] = shortPreview.split(shortHighlight)
    expect(shortBefore).toBe(`…${longBefore.slice(-18)}`)
    expect(shortAfter).toBe(`${longAfter.slice(0, 18)}…`)
  })

  it("should select annotations and delete the selection", async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined)
    render(
      <ReadiumAnnotationPanel
        visible
        annotations={[annotation, secondAnnotation]}
        loading={false}
        mutating={false}
        onRetry={vi.fn()}
        onSelect={vi.fn()}
        onEdit={vi.fn()}
        onDelete={onDelete}
      />,
    )

    fireEvent.contextMenu(screen.getByText("被高亮的正文"))
    fireEvent.click(await screen.findByRole("menuitem", { name: "选择" }))
    fireEvent.click(screen.getByRole("button", { name: /另一段高亮正文/ }))
    expect(screen.getByText("已选择 2 条高亮与笔记")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "删除所选高亮与笔记" }))

    await waitFor(() => expect(onDelete).toHaveBeenCalledTimes(2))
    expect(onDelete).toHaveBeenNthCalledWith(1, annotation)
    expect(onDelete).toHaveBeenNthCalledWith(2, secondAnnotation)
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
        onDelete={vi.fn()}
      />,
    )

    expect(screen.getByRole("alert")).toHaveTextContent("offline")
    fireEvent.click(screen.getByRole("button", { name: "重试" }))
    expect(onRetry).toHaveBeenCalledOnce()
  })
})
