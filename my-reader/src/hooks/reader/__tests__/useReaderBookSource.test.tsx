import "@/i18n"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ReadingPositionCandidateDto } from "@/lib/tauri-api"
import { scheduleReaderProgressSave } from "@/lib/readerProgressPersistence"
import { useLibraryUiStore } from "@/stores/libraryUiStore"
import { useReaderBookSource } from "../useReaderBookSource"

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  setTitle: vi.fn(),
  close: vi.fn(),
  onCloseRequested: vi.fn(),
  api: {
    getBookDetail: vi.fn(),
    getReadingProgress: vi.fn(),
    listReadingPositionCandidates: vi.fn(),
    prepareBookSource: vi.fn(),
    closeBookStreamer: vi.fn(),
    selectReadingPositionCandidate: vi.fn(),
    downloadBookFile: vi.fn(),
    cancelBookDownload: vi.fn(),
    setReadingProgress: vi.fn(),
  },
}))
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => mocks.navigate }))
vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => true,
  convertFileSrc: (path: string) => `asset:${path}`,
}))
vi.mock("@tauri-apps/api/webviewWindow", () => ({
  WebviewWindow: { getCurrent: () => ({ setTitle: mocks.setTitle }) },
}))
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    close: mocks.close,
    onCloseRequested: mocks.onCloseRequested,
  }),
}))
vi.mock("@/lib/readerWindow", () => ({
  isMainWebviewWindow: () => false,
  openReaderInNewWindow: vi.fn(),
}))
vi.mock("@/lib/tauri-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/tauri-api")>()),
  api: mocks.api,
}))

const savedLocator = {
  href: "chapter.xhtml",
  type: "application/xhtml+xml",
  locations: { position: 3 },
}
const candidates: ReadingPositionCandidateDto[] = [
  {
    operationId: "first",
    replicaId: "device-one",
    locator: savedLocator,
    recordedAt: 1,
    displayProgression: 0.2,
  },
  {
    operationId: "second",
    replicaId: "device-two",
    locator: { ...savedLocator, locations: { position: 7 } },
    recordedAt: 2,
    displayProgression: 0.6,
  },
]
let client: QueryClient
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
function book(title = "Book") {
  return { title, readableFormats: ["EPUB", "PDF"], preferredFormat: "EPUB" }
}

beforeEach(() => {
  vi.resetAllMocks()
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  useLibraryUiStore.setState({ activeLibraryId: "library" })
  mocks.onCloseRequested.mockResolvedValue(() => {})
  mocks.api.getBookDetail.mockResolvedValue(book())
  mocks.api.getReadingProgress.mockResolvedValue({ locator: savedLocator })
  mocks.api.listReadingPositionCandidates.mockResolvedValue(candidates)
  mocks.api.prepareBookSource.mockResolvedValue({
    filePath: "/book.epub",
    extractedDirPath: "/book",
    extractedEntries: [],
  })
  mocks.api.closeBookStreamer.mockResolvedValue(undefined)
  mocks.api.selectReadingPositionCandidate.mockResolvedValue(undefined)
  mocks.api.downloadBookFile.mockResolvedValue(undefined)
})
afterEach(() => {
  cleanup()
  client.clear()
})

describe("useReaderBookSource", () => {
  it("persists the latest pending page before closing the reader window", async () => {
    const { result } = renderHook(
      () => useReaderBookSource({ bookId: "4", formatFromSearch: "PDF" }),
      { wrapper },
    )
    await waitFor(() => expect(result.current.bookPayload).not.toBeNull())
    let finishSave!: () => void
    mocks.api.setReadingProgress.mockReturnValue(
      new Promise<void>((resolve) => {
        finishSave = resolve
      }),
    )
    scheduleReaderProgressSave("library", 4, "PDF", savedLocator, 0.3)
    const latest = { ...savedLocator, locations: { position: 4 } }
    scheduleReaderProgressSave("library", 4, "PDF", latest, 0.4)
    const calls = mocks.onCloseRequested.mock.calls
    const closeRequested = calls[calls.length - 1][0]
    const event = { preventDefault: vi.fn() }
    const closing = closeRequested(event)

    await waitFor(() => expect(mocks.api.setReadingProgress).toHaveBeenCalled())
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(mocks.close).not.toHaveBeenCalled()
    expect(mocks.api.setReadingProgress).toHaveBeenCalledExactlyOnceWith(
      "library",
      4,
      "PDF",
      latest,
      0.4,
    )
    finishSave()
    await closing
    expect(mocks.close).toHaveBeenCalledOnce()
  })

  it("loads the requested format and saved position with native asset URLs", async () => {
    const { result } = renderHook(
      () => useReaderBookSource({ bookId: "4", formatFromSearch: "PDF" }),
      { wrapper },
    )
    await waitFor(() => expect(result.current.bookPayload).not.toBeNull())
    expect(mocks.api.prepareBookSource).toHaveBeenCalledWith(
      "library",
      4,
      "PDF",
    )
    expect(result.current.bookPayload?.source).toEqual({
      filePath: "asset:/book.epub",
      extractedDirPath: "asset:/book",
      extractedEntries: [],
    })
    expect(
      result.current.bookPayload?.initialSavedLocator?.locations.position,
    ).toBe(3)
    expect(result.current.positionConflict).toEqual(candidates)
  })

  it("ignores an old book response after navigation and closes its streamer", async () => {
    let finishOld!: (value: ReturnType<typeof book>) => void
    mocks.api.getBookDetail.mockImplementation((_library, bookId) =>
      bookId === 1
        ? new Promise((resolve) => {
            finishOld = resolve
          })
        : Promise.resolve(book("New book")),
    )
    const { result, rerender } = renderHook(
      ({ bookId }) => useReaderBookSource({ bookId }),
      { wrapper, initialProps: { bookId: "1" } },
    )
    rerender({ bookId: "2" })
    await waitFor(() => expect(result.current.bookTitle).toBe("New book"))
    await act(async () => finishOld(book("Old book")))
    expect(result.current.bookTitle).toBe("New book")
    expect(mocks.api.prepareBookSource).not.toHaveBeenCalledWith(
      "library",
      1,
      expect.anything(),
    )
    expect(mocks.api.closeBookStreamer).toHaveBeenCalledWith("library", 1)
  })

  it("applies a selected conflict only after the backend accepts it", async () => {
    const { result } = renderHook(() => useReaderBookSource({ bookId: "4" }), {
      wrapper,
    })
    await waitFor(() => expect(result.current.positionConflict).toHaveLength(2))
    await act(() => result.current.handlePositionConflict(candidates[1]))
    expect(mocks.api.selectReadingPositionCandidate).toHaveBeenCalledWith(
      "library",
      4,
      "EPUB",
      "second",
    )
    expect(result.current.positionConflict).toBeNull()
    expect(
      result.current.bookPayload?.initialSavedLocator?.locations.position,
    ).toBe(7)
  })

  it("keeps the original position and exposes failed conflict persistence", async () => {
    mocks.api.selectReadingPositionCandidate.mockRejectedValue(
      new Error("disk full"),
    )
    const { result } = renderHook(() => useReaderBookSource({ bookId: "4" }), {
      wrapper,
    })
    await waitFor(() => expect(result.current.positionConflict).toHaveLength(2))
    await act(() => result.current.handlePositionConflict(candidates[1]))
    expect(
      result.current.bookPayload?.initialSavedLocator?.locations.position,
    ).toBe(3)
    expect(result.current.positionConflict).toEqual(candidates)
    expect(result.current.fetchError).toBe(
      "未能完成此操作，请重试。\nError: disk full",
    )
    expect(result.current.resolvingPositionConflict).toBe(false)
  })

  it("requests a missing remote file and can retry a rejected download", async () => {
    mocks.api.prepareBookSource.mockRejectedValue(
      Object.assign(new Error("diagnostic changed"), {
        kind: "BookFormatNotDownloaded",
      }),
    )
    mocks.api.downloadBookFile.mockRejectedValueOnce(new Error("offline"))
    const { result } = renderHook(() => useReaderBookSource({ bookId: "4" }), {
      wrapper,
    })
    await waitFor(() => expect(result.current.downloadState).toBe("error"))
    expect(result.current.downloadError).toBe(
      "未能完成此操作，请重试。\nError: offline",
    )
    expect(result.current.fetchError).toBeNull()
    act(() => result.current.handleRetryDownload())
    await waitFor(() =>
      expect(mocks.api.downloadBookFile).toHaveBeenCalledTimes(2),
    )
    expect(result.current.downloadState).toBe("downloading")
    expect(result.current.downloadError).toBeNull()
  })

  it("does not prepare or download a book without a supported format", async () => {
    mocks.api.getBookDetail.mockResolvedValue({
      ...book(),
      readableFormats: [],
      preferredFormat: null,
    })
    const { result } = renderHook(() => useReaderBookSource({ bookId: "4" }), {
      wrapper,
    })
    await waitFor(() => expect(result.current.fetchError).not.toBeNull())
    expect(result.current.bookPayload).toBeNull()
    expect(mocks.api.prepareBookSource).not.toHaveBeenCalled()
    expect(mocks.api.downloadBookFile).not.toHaveBeenCalled()
  })
})
