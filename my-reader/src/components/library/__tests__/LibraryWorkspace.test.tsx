import i18n from "@/i18n"
import type { CalibreBook } from "@my-reader/tools/types/book"
import type { BuiltInBookCollectionId } from "@my-reader/tools/types/book-collection"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { type ComponentProps, type ReactNode, useState } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useAppUiStore } from "@/stores/appUiStore"
import { useLibraryUiStore } from "@/stores/libraryUiStore"
import { SidebarProvider } from "@/components/ui/sidebar"
import type BookGrid from "../BookGrid"
import LibraryWorkspace from "../LibraryWorkspace"

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  paginated: vi.fn(),
  favorites: vi.fn(),
  special: vi.fn(),
  deleteBook: vi.fn(),
  toastError: vi.fn(),
  refresh: vi.fn(),
  refetchFavorites: vi.fn(),
  refreshSpecial: vi.fn(),
  windowSizeClass: vi.fn(() => "large"),
}))

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
  useLocation: () => ({ search: {} }),
  useRouter: () => ({ history: { canGoBack: () => false } }),
}))
vi.mock("@/hooks/queries/useCatalogNavigation", () => ({
  useCatalogNavigation: () => ({
    data: { authors: [], tags: [], series: [] },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}))
vi.mock("sonner", () => ({ toast: { error: mocks.toastError } }))
vi.mock("@/lib/tauri-api", () => ({
  api: { deleteBook: mocks.deleteBook },
  formatApiError: String,
}))
vi.mock("@/hooks/queries/useLibrariesQuery", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useLibrariesQuery: () => ({
    data: [
      { id: "lib-1", name: "书库", libraryType: "myreader", bookCount: 1 },
    ],
    isLoading: false,
  }),
}))
vi.mock("@/hooks/queries/useBookReadingFormatsQuery", () => ({
  useBookReadingFormats: () => ({ data: {} }),
}))
vi.mock("@/hooks/queries/useReadingProgressQuery", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useBookReadingProgress: () => ({ data: {} }),
}))
vi.mock("@/hooks/queries/useBookFileState", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useBookFileStates: vi.fn(),
}))
vi.mock("@/hooks/queries/useFavoriteBooksQuery", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useFavoriteBooks: mocks.favorites,
}))
vi.mock(
  "@/hooks/queries/useSpecialBookCollectionQuery",
  async (importOriginal) => ({
    ...(await importOriginal<object>()),
    useSpecialBookCollection: mocks.special,
  }),
)
vi.mock("@/hooks/reader/usePaginatedBooks", () => ({
  usePaginatedBooks: mocks.paginated,
}))
vi.mock("@/hooks/reader/useOpenReader", () => ({
  useOpenReader: () => vi.fn(),
}))
vi.mock("@/hooks/use-window-size-class", () => ({
  useWindowSizeClass: mocks.windowSizeClass,
}))
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }))
vi.mock("../LibrarySyncStatus", () => ({ default: () => null }))
vi.mock("../BookDetailPane", () => ({ default: () => <div>图书详情</div> }))
vi.mock("../BookGrid", () => ({
  LibrarySkeletonGrid: () => <div>加载书库</div>,
  default: function BookGridMock({
    books,
    onDeleteBook,
  }: ComponentProps<typeof BookGrid>) {
    const [value, setValue] = useState("")
    return (
      <div>
        <input
          aria-label="列表内状态"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
        {Array.from(books.values(), (book) => (
          <button
            key={book.id}
            type="button"
            onClick={() => onDeleteBook?.(book)}
          >
            {book.title}
          </button>
        ))}
      </div>
    )
  },
}))

const book = {
  id: 42,
  title: "待删除的书",
  preferredFormat: "EPUB",
} as CalibreBook

function collectionResult(title: string, refresh = mocks.refresh) {
  return {
    books: new Map([[0, { ...book, title }]]),
    total: 1,
    initialLoading: false,
    error: null,
    ensureRange: vi.fn(),
    refresh,
  }
}

function renderWorkspace(activeBookId: string | null = null) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <LibraryWorkspace
      activeBookId={activeBookId}
      onAddLibrary={vi.fn()}
      sidebar={null}
      settings={null}
    />,
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>
          <SidebarProvider>{children}</SidebarProvider>
        </QueryClientProvider>
      ),
    },
  )
}

describe("LibraryWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.windowSizeClass.mockReturnValue("large")
    mocks.deleteBook.mockResolvedValue(undefined)
    mocks.paginated.mockReturnValue(collectionResult(book.title))
    mocks.favorites.mockReturnValue({
      data: { items: [{ ...book, title: "收藏的书" }], total: 1 },
      isLoading: false,
      error: null,
      refetch: mocks.refetchFavorites,
    })
    mocks.special.mockReturnValue(
      collectionResult("特殊集合的书", mocks.refreshSpecial),
    )
    useLibraryUiStore.setState({
      activeLibraryId: "lib-1",
      activeCollectionId: "all",
      librarySearchQuery: "",
      librarySortBy: "title",
    })
    useAppUiStore.setState({ detailFullScreen: false, libraryViewMode: "grid" })
  })

  it("connects search, view mode and sorting from the window title bar", async () => {
    const user = userEvent.setup()
    renderWorkspace()
    const titlebar = within(screen.getByTestId("app-titlebar"))
    await user.type(titlebar.getByRole("combobox"), "夜航")
    expect(useLibraryUiStore.getState().librarySearchQuery).toBe("夜航")
    await user.click(
      titlebar.getByRole("button", { name: i18n.t("library.listView") }),
    )
    expect(useAppUiStore.getState().libraryViewMode).toBe("list")
    await user.click(
      titlebar.getByRole("button", { name: i18n.t("library.sort.title") }),
    )
    await user.click(
      screen.getByRole("menuitem", { name: i18n.t("library.sort.author") }),
    )
    expect(useLibraryUiStore.getState().librarySortBy).toBe("author")
    expect(
      titlebar.queryByRole("button", { name: i18n.t("library.filter") }),
    ).toBeNull()
  })

  it("puts full-screen before the detail toggle and keeps navigation in the title bar", async () => {
    const user = userEvent.setup()
    renderWorkspace("42")
    const titlebar = screen.getByTestId("app-titlebar")
    expect(
      within(screen.getByTestId("detail-titlebar"))
        .getAllByRole("button")
        .map((button) => button.dataset.testid),
    ).toEqual(["book-detail-fullscreen-toggle", "book-detail-close"])
    await user.click(screen.getByTestId("book-detail-fullscreen-toggle"))
    expect(useAppUiStore.getState().detailFullScreen).toBe(true)
    expect(screen.queryByTestId("library-titlebar")).toBeNull()
    expect(titlebar).toContainElement(screen.getByTestId("book-detail-back"))
    await user.click(screen.getByTestId("book-detail-back"))
    expect(mocks.navigate).toHaveBeenCalledWith(
      expect.objectContaining({ to: "/" }),
    )
  })

  it("reopens the closed detail only in the same library", async () => {
    const user = userEvent.setup()
    const view = renderWorkspace("42")
    await user.click(screen.getByTestId("book-detail-close"))
    expect(mocks.navigate).toHaveBeenCalledWith(
      expect.objectContaining({ to: "/" }),
    )
    view.rerender(
      <LibraryWorkspace
        activeBookId={null}
        onAddLibrary={vi.fn()}
        sidebar={null}
        settings={null}
      />,
    )
    const open = screen.getByTestId("book-detail-open")
    expect(open).toHaveAttribute("aria-expanded", "false")
    expect(screen.getByTestId("app-titlebar")).toContainElement(open)
    await user.click(open)
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/book/$bookId",
      params: { bookId: "42" },
      search: { catalog: undefined },
    })
    act(() => useLibraryUiStore.setState({ activeLibraryId: "lib-2" }))
    expect(screen.queryByTestId("book-detail-open")).toBeNull()
  })

  it("keeps back navigation and omits full-screen in a compact window", async () => {
    mocks.windowSizeClass.mockReturnValue("small")
    renderWorkspace("42")
    const titlebar = screen.getByTestId("app-titlebar")
    expect(titlebar).toContainElement(screen.getByTestId("book-detail-back"))
    expect(titlebar).toContainElement(screen.getByTestId("book-detail-close"))
    expect(screen.queryByTestId("book-detail-fullscreen-toggle")).toBeNull()
    expect(screen.queryByTestId("library-titlebar")).toBeNull()
  })

  it("removes the reopen action when the closed book is deleted", async () => {
    const user = userEvent.setup()
    const view = renderWorkspace("42")
    await user.click(screen.getByTestId("book-detail-close"))
    view.rerender(
      <LibraryWorkspace
        activeBookId={null}
        onAddLibrary={vi.fn()}
        sidebar={null}
        settings={null}
      />,
    )
    await user.click(screen.getByRole("button", { name: book.title }))
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "删除图书",
      }),
    )
    await waitFor(() =>
      expect(screen.queryByTestId("book-detail-open")).toBeNull(),
    )
  })

  it("hides workspace title-bar actions while settings are open", () => {
    const view = renderWorkspace("42")
    view.rerender(
      <LibraryWorkspace
        activeBookId="42"
        onAddLibrary={vi.fn()}
        sidebar={null}
        settings={<div>应用设置</div>}
      />,
    )
    expect(screen.getByText("应用设置")).toBeVisible()
    expect(screen.queryByTestId("library-titlebar")).toBeNull()
    expect(screen.queryByTestId("detail-titlebar")).toBeNull()
    expect(screen.getByTestId("library-pane")).toBeInTheDocument()
  })

  it.each<[BuiltInBookCollectionId, string]>([
    ["all", "待删除的书"],
    ["recentlyRead", "待删除的书"],
    ["favorites", "收藏的书"],
    ["downloaded", "特殊集合的书"],
    ["downloading", "特殊集合的书"],
    ["uploading", "特殊集合的书"],
    ["localOnly", "特殊集合的书"],
  ])("selects the %s collection without enabling unrelated queries", (collection, title) => {
    useLibraryUiStore.setState({ activeCollectionId: collection })
    renderWorkspace()
    expect(screen.getByRole("button", { name: title })).toBeInTheDocument()
    expect(mocks.paginated).toHaveBeenCalledWith(
      ["all", "recentlyRead"].includes(collection) ? "lib-1" : null,
      collection === "recentlyRead" ? "lastRead" : "title",
      "",
      true,
      [],
    )
    expect(mocks.favorites).toHaveBeenCalledWith(
      collection === "favorites" ? "lib-1" : null,
      "title",
      "",
      [],
    )
  })

  it("retries the failing collection instead of the all-books query", async () => {
    useLibraryUiStore.setState({ activeCollectionId: "favorites" })
    mocks.favorites.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("离线"),
      refetch: mocks.refetchFavorites,
    })
    renderWorkspace()
    expect(
      screen.getByText("未能完成此操作，请重试。 Error: 离线"),
    ).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole("button", { name: "重试" }))
    expect(mocks.refetchFavorites).toHaveBeenCalledOnce()
    expect(mocks.refresh).not.toHaveBeenCalled()
  })

  it.each<[BuiltInBookCollectionId, string]>([
    ["all", ""],
    ["favorites", ""],
    ["localOnly", ""],
    ["all", "未找到"],
  ])("offers the appropriate empty-collection action for %s with search '%s'", async (collection, search) => {
    mocks.paginated.mockReturnValue({
      ...collectionResult(""),
      books: new Map(),
      total: 0,
    })
    mocks.special.mockReturnValue({
      ...collectionResult(""),
      books: new Map(),
      total: 0,
    })
    mocks.favorites.mockReturnValue({
      data: { items: [], total: 0 },
      isLoading: false,
      error: null,
      refetch: mocks.refetchFavorites,
    })
    useLibraryUiStore.setState({
      activeCollectionId: collection,
      librarySearchQuery: search,
    })
    renderWorkspace()
    const importButton = within(screen.getByTestId("library-pane")).queryByRole(
      "button",
      {
        name: i18n.t("library.empty.importBook"),
      },
    )
    const browseButton = screen.queryByRole("button", {
      name: i18n.t("library.browseAllBooks"),
    })
    expect(Boolean(importButton)).toBe(collection === "all" && !search)
    expect(Boolean(browseButton)).toBe(collection === "favorites" && !search)
    if (browseButton) {
      await userEvent.setup().click(browseButton)
      expect(useLibraryUiStore.getState().activeCollectionId).toBe("all")
      expect(mocks.navigate).toHaveBeenCalledWith(
        expect.objectContaining({ to: "/" }),
      )
    }
  })

  it("retains list state while switching between split and full-screen detail", async () => {
    const user = userEvent.setup()
    renderWorkspace("42")
    await user.type(
      screen.getByRole("textbox", { name: "列表内状态" }),
      "保留状态",
    )
    act(() => useAppUiStore.getState().setDetailFullScreen(true))
    expect(screen.getByTestId("library-pane")).toHaveAttribute(
      "aria-hidden",
      "true",
    )
    act(() => useAppUiStore.getState().setDetailFullScreen(false))
    expect(screen.getByRole("textbox", { name: "列表内状态" })).toHaveValue(
      "保留状态",
    )
  })

  it("requires confirmation and leaves the active detail after successful deletion", async () => {
    const user = userEvent.setup()
    renderWorkspace("42")
    await user.click(screen.getByRole("button", { name: book.title }))
    expect(mocks.deleteBook).not.toHaveBeenCalled()
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "删除图书",
      }),
    )
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    )
    expect(mocks.deleteBook).toHaveBeenCalledExactlyOnceWith("lib-1", 42)
    expect(mocks.navigate).toHaveBeenCalledWith(
      expect.objectContaining({ to: "/" }),
    )
    expect(mocks.refresh).toHaveBeenCalledOnce()
  })

  it("keeps deletion confirmation open on failure without navigating or refreshing", async () => {
    mocks.deleteBook.mockRejectedValueOnce(new Error("无法删除"))
    const user = userEvent.setup()
    renderWorkspace("42")
    await user.click(screen.getByRole("button", { name: book.title }))
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "删除图书",
      }),
    )
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalled())
    expect(screen.getByRole("dialog")).toBeInTheDocument()
    expect(mocks.navigate).not.toHaveBeenCalled()
    expect(mocks.refresh).not.toHaveBeenCalled()
  })
})
