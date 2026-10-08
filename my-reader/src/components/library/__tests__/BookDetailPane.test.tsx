import i18n from "@/i18n"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { BookDetail } from "@/lib/tauri-api"
import { useLibraryUiStore } from "@/stores/libraryUiStore"
import BookDetailPane from "../BookDetailPane"

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  api: {
    listLibraries: vi.fn(),
    listBookReadingFormats: vi.fn(),
    listReadingProgress: vi.fn(),
    listFavoriteBookIds: vi.fn(),
    getBookDetail: vi.fn(),
    getSeriesBooks: vi.fn(),
    setBookReadingFormat: vi.fn(),
    updateBookMetadata: vi.fn(),
    checkBookFileState: vi.fn(),
    downloadBookFile: vi.fn(),
    cancelBookDownload: vi.fn(),
  },
}))

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => mocks.navigate }))
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => false }))
vi.mock("@/lib/tauri-api", () => ({ api: mocks.api, formatApiError: String }))
vi.mock("@/hooks/use-overlay-scrollbar", () => ({
  useOverlayScrollbar: vi.fn(),
}))
vi.mock("@/hooks/useCoverObjectUrl", () => ({
  useCoverObjectUrl: () => ({
    coverSrc: null,
    coverCacheKey: null,
    coverLoadError: null,
  }),
}))

function makeBook(overrides: Partial<BookDetail> = {}): BookDetail {
  return {
    id: 42,
    title: "详情书",
    authors: ["原作者"],
    authorSort: "原作者",
    tags: [],
    formats: ["EPUB", "PDF", "MOBI"],
    readableFormats: ["EPUB", "PDF"],
    preferredFormat: "EPUB",
    series: null,
    seriesIndex: null,
    hasCover: false,
    path: "book",
    timestamp: null,
    pubdate: null,
    lastModified: null,
    comment: null,
    publisher: null,
    languages: [],
    rating: null,
    uuid: "book-42",
    formatSizes: [],
    identifiers: [],
    ...overrides,
  }
}

function renderDetail(onLibraryChanged = vi.fn()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const view = (bookId: string) => (
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <BookDetailPane
          bookId={bookId}
          forceWideHero
          onLibraryChanged={onLibraryChanged}
        />
      </TooltipProvider>
    </QueryClientProvider>
  )
  return { ...render(view("42")), view }
}

describe("BookDetailPane", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    )
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value: vi.fn(),
    })
    useLibraryUiStore.setState({ activeLibraryId: "lib-1" })
    mocks.api.listLibraries.mockResolvedValue([
      {
        id: "lib-1",
        name: "书库",
        libraryType: "myreader",
        sourceType: "local",
        bookCount: 1,
      },
    ])
    mocks.api.listBookReadingFormats.mockResolvedValue({ "42": "PDF" })
    mocks.api.listReadingProgress.mockResolvedValue([])
    mocks.api.listFavoriteBookIds.mockResolvedValue([])
    mocks.api.getBookDetail.mockResolvedValue(makeBook())
    mocks.api.getSeriesBooks.mockResolvedValue([])
    mocks.api.setBookReadingFormat.mockResolvedValue(undefined)
    mocks.api.checkBookFileState.mockResolvedValue({
      localState: "present",
      path: "book",
      localSize: 1,
    })
    mocks.api.downloadBookFile.mockResolvedValue(undefined)
    mocks.api.cancelBookDownload.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("uses the saved reading format and immediately reads a newly selected default", async () => {
    const user = userEvent.setup()
    renderDetail()
    const pdfSwitch = await screen.findByRole("switch", {
      name: "将 PDF 设为默认阅读格式",
    })
    expect(pdfSwitch).toBeChecked()
    expect(pdfSwitch).toBeDisabled()
    expect(
      screen.getByRole("switch", { name: "将 MOBI 设为默认阅读格式" }),
    ).toBeDisabled()
    await user.click(screen.getAllByRole("button", { name: "开始阅读" })[0]!)
    expect(mocks.navigate).toHaveBeenLastCalledWith({
      to: "/read/$bookId",
      params: { bookId: "42" },
      search: { format: "PDF" },
    })
    await user.click(
      screen.getByRole("switch", { name: "将 EPUB 设为默认阅读格式" }),
    )
    await waitFor(() =>
      expect(mocks.api.setBookReadingFormat).toHaveBeenCalledWith(
        "lib-1",
        42,
        "EPUB",
      ),
    )
    await user.click(screen.getAllByRole("button", { name: "开始阅读" })[0]!)
    expect(mocks.navigate).toHaveBeenLastCalledWith({
      to: "/read/$bookId",
      params: { bookId: "42" },
      search: { format: "EPUB" },
    })
  })

  it("saves trimmed metadata with both comma separators and refreshes the catalog", async () => {
    mocks.api.updateBookMetadata.mockResolvedValue({
      title: "新书名",
      authors: ["甲", "乙", "丙"],
    })
    const onLibraryChanged = vi.fn()
    const user = userEvent.setup()
    renderDetail(onLibraryChanged)
    await screen.findAllByText("详情书")
    await user.click(screen.getAllByRole("button", { name: "更多操作" })[0]!)
    await user.click(screen.getByRole("menuitem", { name: "修改书名与作者" }))
    const dialog = within(screen.getByRole("dialog"))
    await user.clear(dialog.getByLabelText("书名"))
    expect(dialog.getByRole("button", { name: "保存" })).toBeDisabled()
    await user.type(dialog.getByLabelText("书名"), "  新书名  ")
    await user.clear(dialog.getByLabelText("作者"))
    await user.type(dialog.getByLabelText("作者"), " 甲, 乙，丙,, ")
    await user.click(dialog.getByRole("button", { name: "保存" }))
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    )
    expect(mocks.api.updateBookMetadata).toHaveBeenCalledExactlyOnceWith(
      "lib-1",
      42,
      "新书名",
      ["甲", "乙", "丙"],
    )
    expect(screen.getAllByText("新书名").length).toBeGreaterThan(0)
    expect(onLibraryChanged).toHaveBeenCalledOnce()
  })

  it("ignores an obsolete detail response after switching books", async () => {
    let resolveOld!: (value: BookDetail) => void
    const oldResponse = new Promise<BookDetail>((resolve) => {
      resolveOld = resolve
    })
    mocks.api.getBookDetail.mockImplementation((_libraryId, id) =>
      id === 42
        ? oldResponse
        : Promise.resolve(makeBook({ id: 43, title: "下一本" })),
    )
    const { rerender, view } = renderDetail()
    await waitFor(() =>
      expect(mocks.api.getBookDetail).toHaveBeenCalledWith("lib-1", 42),
    )
    rerender(view("43"))
    await screen.findAllByText("下一本")
    await act(async () => resolveOld(makeBook()))
    expect(screen.queryByText("详情书")).not.toBeInTheDocument()
    expect(screen.getAllByText("下一本").length).toBeGreaterThan(0)
  })

  it("retries a failed detail request", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    mocks.api.getBookDetail.mockRejectedValueOnce(new Error("offline"))
    renderDetail()
    await userEvent
      .setup()
      .click(
        await screen.findByRole("button", { name: i18n.t("bookDetail.retry") }),
      )
    await screen.findAllByText("详情书")
    expect(mocks.api.getBookDetail).toHaveBeenCalledTimes(2)
  })

  it("returns to the library when the book no longer exists", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    mocks.api.getBookDetail.mockRejectedValueOnce(
      Object.assign(new Error("BOOK_NOT_FOUND"), { kind: "NotFound" }),
    )
    renderDetail()
    expect(
      await screen.findByText(i18n.t("bookDetail.notFound.title")),
    ).toBeInTheDocument()
    await userEvent.setup().click(
      screen.getByRole("button", {
        name: i18n.t("bookDetail.backToLibrary"),
      }),
    )
    expect(mocks.navigate).toHaveBeenCalledWith({ to: "/" })
    expect(mocks.api.getBookDetail).toHaveBeenCalledOnce()
  })

  it("does not request details without an active library", async () => {
    useLibraryUiStore.setState({ activeLibraryId: null })
    renderDetail()
    expect(
      await screen.findByText(i18n.t("bookDetail.libraryUnavailable.title")),
    ).toBeInTheDocument()
    expect(mocks.api.getBookDetail).not.toHaveBeenCalled()
  })

  it("downloads and cancels the selected remote file from the format table", async () => {
    mocks.api.listLibraries.mockResolvedValue([
      {
        id: "lib-1",
        name: "远程书库",
        libraryType: "myreader",
        sourceType: "webdav",
        bookCount: 1,
      },
    ])
    mocks.api.getBookDetail.mockResolvedValue(makeBook({ formats: ["EPUB"] }))
    mocks.api.checkBookFileState.mockResolvedValue({
      localState: "remote_only",
      path: "book",
      localSize: null,
    })
    const user = userEvent.setup()
    renderDetail()
    const formats = within(await screen.findByRole("table"))
    await user.click(await formats.findByRole("button", { name: "下载文件" }))
    expect(mocks.api.downloadBookFile).toHaveBeenCalledExactlyOnceWith(
      "lib-1",
      42,
      "EPUB",
    )
    await user.click(await formats.findByRole("button", { name: "取消下载" }))
    expect(mocks.api.cancelBookDownload).toHaveBeenCalledExactlyOnceWith(
      "lib-1",
      42,
      "EPUB",
    )
    expect(
      await formats.findByRole("button", { name: "下载文件" }),
    ).toBeInTheDocument()
  })

  it.each([
    "local_only",
    "dirty_push",
  ])("shows %s as pending upload, without exposing delete-local-file", async (localState) => {
    mocks.api.listLibraries.mockResolvedValue([
      {
        id: "lib-1",
        name: "远程书库",
        libraryType: "myreader",
        sourceType: "webdav",
        bookCount: 1,
      },
    ])
    mocks.api.getBookDetail.mockResolvedValue(makeBook({ formats: ["EPUB"] }))
    mocks.api.checkBookFileState.mockResolvedValue({
      localState,
      path: "book",
      localSize: 1024,
    })
    renderDetail()
    const formats = within(await screen.findByRole("table"))
    expect(await formats.findByRole("img")).toHaveAttribute(
      "data-download-status",
      "local_only",
    )
    expect(
      formats.queryByRole("button", { name: "删除本地文件" }),
    ).not.toBeInTheDocument()
    expect(
      formats.queryByRole("button", { name: "下载文件" }),
    ).not.toBeInTheDocument()
  })
})
