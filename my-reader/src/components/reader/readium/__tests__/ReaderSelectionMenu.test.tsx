import "@/i18n"
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ReaderSelectionMenu } from "../ReaderSelectionMenu"

describe("ReaderSelectionMenu", () => {
  it("should show note and remove actions for an existing highlight", () => {
    const onEditNote = vi.fn()
    const onRemove = vi.fn()
    render(
      <ReaderSelectionMenu
        anchor={{ x: 200, y: 240 }}
        currentColor="orange"
        existing
        hasNote
        onColorSelect={vi.fn()}
        onEditNote={onEditNote}
        onRemove={onRemove}
        onOpenChange={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "编辑笔记" }))
    fireEvent.click(screen.getByRole("button", { name: "移除" }))

    expect(onEditNote).toHaveBeenCalledTimes(1)
    expect(onRemove).toHaveBeenCalledTimes(1)
  })

  it("should show four color actions directly", () => {
    const onColorSelect = vi.fn()
    render(
      <ReaderSelectionMenu
        anchor={{ x: 200, y: 240 }}
        currentColor="orange"
        onColorSelect={onColorSelect}
        onEditNote={vi.fn()}
        onRemove={vi.fn()}
        onOpenChange={vi.fn()}
      />,
    )

    const colors = ["琥珀黄", "陶土橙", "鼠尾草绿", "雾霾蓝"]
    expect(
      colors.map((name) => screen.getByRole("button", { name })),
    ).toHaveLength(4)
    expect(screen.queryByRole("button", { name: "高亮" })).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "雾霾蓝" }))
    expect(onColorSelect).toHaveBeenCalledWith("blue")
  })
})
