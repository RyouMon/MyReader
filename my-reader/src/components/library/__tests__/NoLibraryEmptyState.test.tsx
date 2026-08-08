import "@/i18n"
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { NoLibraryEmptyState } from "../NoLibraryEmptyState"

describe("NoLibraryEmptyState", () => {
  it("should offer only adding a library when no library exists", () => {
    const onAddLibrary = vi.fn()

    render(<NoLibraryEmptyState onAddLibrary={onAddLibrary} />)

    expect(screen.getByText("还没有添加书库")).toBeInTheDocument()
    expect(screen.getByText("创建新书库或打开已有书库。")).toBeInTheDocument()
    expect(screen.queryByText("导入图书")).not.toBeInTheDocument()

    const addButton = screen.getByRole("button", { name: "添加书库" })
    fireEvent.click(addButton)
    expect(onAddLibrary).toHaveBeenCalledOnce()
  })
})
