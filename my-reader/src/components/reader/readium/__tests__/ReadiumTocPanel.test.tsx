import "@/i18n"
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ReadiumTocPanel } from "../ReadiumTocPanel"

describe("ReadiumTocPanel", () => {
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
})
