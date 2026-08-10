import "@/i18n"
import type { Library } from "@my-reader/tools/types/library"
import { act, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SidebarProvider } from "@/components/ui/sidebar"
import { useLibraryUiStore } from "@/stores/libraryUiStore"
import AppSidebar from "../AppSidebar"

const queryState = vi.hoisted(() => ({
  libraries: [] as Library[],
}))

vi.mock("@tanstack/react-router", () => ({
  Link: "a",
  useLocation: () => ({ pathname: "/" }),
  useNavigate: () => vi.fn(),
}))

vi.mock("@/components/AppThemeProvider", () => ({
  useTheme: () => ({ theme: "system", setTheme: vi.fn() }),
}))

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => false,
}))

vi.mock("@/hooks/queries/useLibrariesQuery", () => ({
  useLibrariesQuery: () => ({ data: queryState.libraries }),
}))

vi.mock("@/hooks/queries/useFavoriteBooksQuery", () => ({
  useFavoriteBookIds: () => ({ data: [] }),
}))

vi.mock("@/hooks/queries/useLocalOnlyBooksQuery", () => ({
  useHasLocalOnlyBooks: () => ({ data: false, isLoading: false }),
}))

vi.mock("@/hooks/queries/usePendingBookUploadsQuery", () => ({
  usePendingBookUploads: () => ({ data: [], isLoading: false }),
}))

vi.mock("@/hooks/useDownloadProgress", () => ({
  useDownloadQueue: () => [],
}))

describe("AppSidebar", () => {
  beforeEach(() => {
    queryState.libraries = [
      {
        id: "calibre-library",
        name: "Calibre library",
        path: "/calibre",
        libraryType: "calibre",
        bookCount: 1,
      },
      {
        id: "myreader-library",
        name: "MyReader library",
        path: "/myreader",
        libraryType: "myreader",
        bookCount: 1,
      },
    ]
    useLibraryUiStore.setState({
      activeLibraryId: "calibre-library",
      activeCollectionId: "all",
    })
  })

  it("should switch the sidebar icon when the active library type changes", () => {
    render(
      <SidebarProvider>
        <AppSidebar onAddLibrary={vi.fn()} />
      </SidebarProvider>,
    )

    expect(screen.getByRole("img", { name: "Calibre" })).toHaveAttribute(
      "data-entity-icon",
      "calibreLibrary",
    )

    act(() => {
      useLibraryUiStore.setState({ activeLibraryId: "myreader-library" })
    })

    expect(screen.getByRole("img", { name: "MyReader" })).toHaveAttribute(
      "data-entity-icon",
      "myreaderLibrary",
    )
  })
})
