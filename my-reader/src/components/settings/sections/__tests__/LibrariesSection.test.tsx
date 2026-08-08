import "@/i18n"
import type { Library } from "@my-reader/tools/types/library"
import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import LibrariesSection from "../LibrariesSection"

const queryState = vi.hoisted(() => ({
  libraries: [] as Library[],
}))

vi.mock("@/hooks/queries/useLibrariesQuery", () => ({
  useLibrariesQuery: () => ({ data: queryState.libraries }),
  useLibraryMutations: () => ({ removeLibrary: vi.fn() }),
}))

describe("LibrariesSection", () => {
  beforeEach(() => {
    queryState.libraries = []
  })

  it("should show the standard library empty state when no libraries exist", () => {
    const onAddLibrary = vi.fn()

    render(<LibrariesSection onAddLibrary={onAddLibrary} />)

    expect(screen.getByText("还没有添加书库")).toBeInTheDocument()
    expect(screen.getByText("已添加的书库")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "添加书库" }))
    expect(onAddLibrary).toHaveBeenCalledOnce()
  })

  it("should show the library path in its data source instead of its local mirror", () => {
    queryState.libraries = [
      {
        id: "onedrive-library",
        name: "MyReader 资料书库",
        path: "/Users/wen/Library/Application Support/MyReader/libraries/cache",
        sourcePath: "/Attachments",
        sourceType: "onedrive",
        dataSourceId: "onedrive-source",
        libraryType: "myreader",
        bookCount: 13,
      },
    ]

    render(<LibrariesSection onAddLibrary={vi.fn()} />)

    expect(screen.getByText("/Attachments")).toBeInTheDocument()
    expect(
      screen.queryByText(
        "/Users/wen/Library/Application Support/MyReader/libraries/cache",
      ),
    ).not.toBeInTheDocument()
  })
})
