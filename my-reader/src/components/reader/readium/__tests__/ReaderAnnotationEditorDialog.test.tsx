import "@/i18n"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { readerChromeThemeStyle } from "@/components/reader/shared/ReaderChromeShell"
import { ReaderAnnotationEditorDialog } from "../ReaderAnnotationEditorDialog"

const draft = {
  id: "annotation-1",
  excerpt: "Selected passage",
  color: "orange" as const,
  note: "Existing note",
  createdAt: new Date(2026, 6, 18, 14, 34).getTime(),
}

describe("ReaderAnnotationEditorDialog", () => {
  it("should save the note and selected highlight color when editing", () => {
    const onSave = vi.fn()
    render(
      <ReaderAnnotationEditorDialog
        draft={draft}
        theme="paper"
        onClose={vi.fn()}
        onSave={onSave}
      />,
    )

    expect(screen.getByRole("heading", { name: "笔记" })).toBeInTheDocument()
    expect(screen.getByText("Selected passage")).toBeInTheDocument()
    const note = screen.getByRole("textbox", { name: "笔记" })
    expect(note).not.toHaveAttribute("placeholder")

    fireEvent.change(note, { target: { value: "Updated note" } })
    fireEvent.click(screen.getByRole("button", { name: "鼠尾草绿" }))
    const saveButton = screen.getByRole("button", { name: "保存" })
    expect(saveButton).toHaveTextContent("保存")
    fireEvent.click(saveButton)

    expect(onSave).toHaveBeenCalledWith({
      color: "green",
      note: "Updated note",
    })
  })

  it("should confirm before deleting when the annotation exists", async () => {
    const onDelete = vi.fn()
    render(
      <ReaderAnnotationEditorDialog
        draft={draft}
        theme="paper"
        onClose={vi.fn()}
        onSave={vi.fn()}
        onDelete={onDelete}
      />,
    )

    const deleteButton = screen.getByRole("button", { name: "删除" })
    expect(deleteButton).toHaveTextContent("删除")
    fireEvent.click(deleteButton)
    expect(
      screen.getByRole("heading", { name: "删除这条高亮与笔记？" }),
    ).toBeInTheDocument()
    expect(
      screen.getByText("这条高亮及其笔记将从当前设备移除。"),
    ).toBeInTheDocument()

    const deleteButtons = screen.getAllByRole("button", { name: "删除" })
    fireEvent.click(deleteButtons[deleteButtons.length - 1])
    expect(onDelete).toHaveBeenCalledTimes(1)
    await waitFor(() =>
      expect(
        screen.queryByRole("heading", { name: "删除这条高亮与笔记？" }),
      ).not.toBeInTheDocument(),
    )
  })

  it("should apply the reading theme to the note dialog", () => {
    render(
      <ReaderAnnotationEditorDialog
        draft={draft}
        theme="night"
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    )

    const themeStyle = readerChromeThemeStyle("night")
    const dialog = screen
      .getByRole("heading", { name: "笔记" })
      .closest('[data-slot="dialog-content"]')

    expect(dialog).toHaveStyle({
      "--reader-panel-bg": themeStyle?.["--reader-panel-bg"],
      "--reader-chrome-fg": themeStyle?.["--reader-chrome-fg"],
      "--reader-chrome-muted": themeStyle?.["--reader-chrome-muted"],
    })
  })
})
