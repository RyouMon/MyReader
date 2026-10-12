import "@/i18n"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  flushReaderProgress,
  scheduleReaderProgressSave,
} from "@/lib/readerProgressPersistence"
import { applySidecarSyncCompleted } from "@/hooks/useSidecarSync"
import type { ReadingPositionCandidateDto } from "@/lib/tauri-api"
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
    isLocal: false,
    replicaId: "device-one",
    locator: savedLocator,
    recordedAt: 1,
    displayProgression: 0.2,
  },
  {
    operationId: "second",
    isLocal: false,
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
  mocks.api.getReadingProgress.mockResolvedValue({
    locator: savedLocator,
  })
  mocks.api.listReadingPositionCandidates.mockResolvedValue(candidates)
  mocks.api.prepareBookSource.mockResolvedValue({
    filePath: "/book.epub",
    extractedDirPath: "/book",
    extractedEntries: [],
  })
  mocks.api.closeBookStreamer.mockResolvedValue(undefined)
  mocks.api.downloadBookFile.mockResolvedValue(undefined)
})
afterEach(() => {
  cleanup()
  client.clear()
})

describe("useReaderBookSource", () => {
  it("keeps the open publication and viewport when sync changes the saved position", async () => {
    mocks.api.getReadingProgress.mockResolvedValue({
      locator: savedLocator,
    })
    const { result } = renderHook(() => useReaderBookSource({ bookId: "4" }), {
      wrapper,
    })
    await waitFor(() => expect(result.current.bookPayload).not.toBeNull())
    const payload = result.current.bookPayload
    mocks.api.getReadingProgress.mockResolvedValue({
      locator: candidates[1].locator,
    })
    await act(() =>
      applySidecarSyncCompleted(
        {
          libraryId: "library",
          mode: "full",
          pulled: 1,
          pushed: 0,
        },
        client,
      ),
    )
    expect(result.current.bookPayload).toBe(payload)
    expect(mocks.api.prepareBookSource).toHaveBeenCalledTimes(1)
  })

  it.each([
    null,
    { locator: savedLocator },
  ])("opens without waiting for remote position lookup: %j", async (progress) => {
    mocks.api.getReadingProgress.mockResolvedValue(progress)
    mocks.api.listReadingPositionCandidates.mockReturnValue(
      new Promise(() => {}),
    )
    const { result } = renderHook(() => useReaderBookSource({ bookId: "4" }), {
      wrapper,
    })
    await waitFor(() => expect(result.current.bookPayload).not.toBeNull())
    expect(mocks.api.listReadingPositionCandidates).not.toHaveBeenCalled()
    expect(
      result.current.bookPayload?.initialSavedLocator?.locations.position ??
        null,
    ).toBe(progress ? 3 : null)
  })

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

  it("drains a newer page queued while the reader close is waiting for a save", async () => {
    let finish!: () => void
    mocks.api.setReadingProgress.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    )
    scheduleReaderProgressSave("library", 4, "EPUB", savedLocator, 0.3)
    const closing = flushReaderProgress()
    await waitFor(() =>
      expect(mocks.api.setReadingProgress).toHaveBeenCalledTimes(1),
    )
    scheduleReaderProgressSave("library", 4, "EPUB", candidates[1].locator, 0.8)
    finish()
    await closing
    try {
      expect(mocks.api.setReadingProgress).toHaveBeenCalledTimes(2)
    } finally {
      await flushReaderProgress()
    }
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
