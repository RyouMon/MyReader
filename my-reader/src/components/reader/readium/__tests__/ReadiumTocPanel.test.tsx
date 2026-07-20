import "@/i18n"
import { fireEvent, render, screen } from "@testing-library/react"
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

  it("should highlight and select only the active table of contents row", () => {
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

    expect(screen.getByText("目录")).toBeInTheDocument()
    expect(screen.queryByRole("tab")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "敬畏的力量" })).toHaveAttribute(
      "aria-current",
      "location",
    )
    fireEvent.click(
      screen.getByRole("button", { name: "任何情感都能激发共享行为吗" }),
    )
    expect(onSelect).toHaveBeenCalledWith(rows[2])
  })
})
