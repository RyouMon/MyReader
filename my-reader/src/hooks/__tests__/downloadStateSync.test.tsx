import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, render, screen, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useBookDownloadState } from "@/hooks/queries/useBookDownloadState"
import { bookFileStateKeys } from "@/hooks/queries/useBookFileState"
import { localOnlyBookKeys } from "@/hooks/queries/useLocalOnlyBooksQuery"
import { pendingBookUploadKeys } from "@/hooks/queries/usePendingBookUploadsQuery"
import {
  type BookUploadProgressEvent,
  bookUploadProgressKeys,
  useBookUploadProgressEvents,
} from "@/hooks/useBookUploadProgress"
import {
  type DownloadProgressEvent,
  downloadProgressKeys,
  useDownloadProgressEvents,
} from "@/hooks/useDownloadProgress"

const tauriEventMock = vi.hoisted(() => {
  const listeners = new Map<string, (event: { payload: unknown }) => void>()
  return {
    listeners,
    listen: vi.fn(
      (event: string, callback: (event: { payload: unknown }) => void) => {
        listeners.set(event, callback)
        return Promise.resolve(() => {
          listeners.delete(event)
        })
      },
    ),
  }
})

vi.mock("@tauri-apps/api/event", () => ({
  listen: tauriEventMock.listen,
}))

const tauriApiMock = vi.hoisted(() => ({
  checkBookFileState: vi.fn(),
}))

const toastMock = vi.hoisted(() => ({
  error: vi.fn(),
}))

vi.mock("@/lib/tauri-api", () => ({
  api: {
    checkBookFileState: tauriApiMock.checkBookFileState,
  },
}))

vi.mock("sonner", () => ({
  toast: toastMock,
}))

const libraryId = "lib-1"
const bookId = 42
const format = "EPUB"

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Number.POSITIVE_INFINITY,
      },
    },
  })
}

function makeClientWithDefaultQueryFreshness() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })
}

function renderWithClient(client: QueryClient, children: ReactNode) {
  return render(
    <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  )
}

function DownloadEventsBridge() {
  useDownloadProgressEvents()
  return null
}

function UploadEventsBridge() {
  useBookUploadProgressEvents()
  return null
}

function DownloadStatus({
  testId,
  bookUuid,
}: {
  testId: string
  bookUuid?: string
}) {
  const state = useBookDownloadState(libraryId, bookId, [format], format, {
    bookUuid,
  })
  return <span data-testid={testId}>{state?.status ?? "none"}</span>
}

async function emitGlobalProgress(payload: DownloadProgressEvent) {
  await act(async () => {
    tauriEventMock.listeners.get("download_progress")?.({ payload })
  })
}

async function emitUploadProgress(payload: BookUploadProgressEvent) {
  await act(async () => {
    tauriEventMock.listeners.get("book_upload_progress")?.({ payload })
  })
}

describe("download state synchronization", () => {
  beforeEach(() => {
    tauriEventMock.listeners.clear()
    tauriEventMock.listen.mockClear()
    toastMock.error.mockClear()
    tauriApiMock.checkBookFileState.mockClear()
    tauriApiMock.checkBookFileState.mockResolvedValue({
      path: "book.epub",
      localState: "remote_only",
      localSize: null,
    })
  })

  it("should synchronize mounted entries when global download completes", async () => {
    const client = makeClient()
    client.setQueryData(bookFileStateKeys.detail(libraryId, bookId, format), {
      path: "book.epub",
      localState: "remote_only",
      localSize: null,
    })

    renderWithClient(
      client,
      <>
        <DownloadEventsBridge />
        <DownloadStatus testId="home-status" />
        <DownloadStatus testId="detail-status" />
      </>,
    )

    await waitFor(() => {
      expect(tauriEventMock.listen).toHaveBeenCalledWith(
        "download_progress",
        expect.any(Function),
      )
    })

    await emitGlobalProgress({
      libraryId,
      bookId,
      format,
      status: "done",
      bytesWritten: 1024,
      totalBytes: 1024,
    })

    await waitFor(() => {
      expect(screen.getByTestId("home-status")).toHaveTextContent("present")
      expect(screen.getByTestId("detail-status")).toHaveTextContent("present")
    })
    expect(
      client.getQueryData(
        downloadProgressKeys.detail(libraryId, bookId, format),
      ),
    ).toMatchObject({ status: "done" })
  })

  it("should keep active downloads in the collection queue until completion", async () => {
    const client = makeClient()
    renderWithClient(client, <DownloadEventsBridge />)

    await waitFor(() => {
      expect(tauriEventMock.listen).toHaveBeenCalledWith(
        "download_progress",
        expect.any(Function),
      )
    })
    await emitGlobalProgress({
      libraryId,
      bookId,
      format,
      status: "starting",
      bytesWritten: 0,
    })

    expect(client.getQueryData(downloadProgressKeys.queue(libraryId))).toEqual([
      { bookId, format, status: "starting" },
    ])

    await emitGlobalProgress({
      libraryId,
      bookId,
      format,
      status: "done",
      bytesWritten: 1024,
      totalBytes: 1024,
    })

    expect(client.getQueryData(downloadProgressKeys.queue(libraryId))).toEqual(
      [],
    )
  })

  it("should clear stale terminal progress when remote file state resets", async () => {
    const client = makeClient()
    client.setQueryData(bookFileStateKeys.detail(libraryId, bookId, format), {
      path: "book.epub",
      localState: "present",
      localSize: 1024,
    })
    client.setQueryData(
      downloadProgressKeys.detail(libraryId, bookId, format),
      {
        status: "done",
        bytesWritten: 1024,
        totalBytes: 1024,
      },
    )

    renderWithClient(
      client,
      <>
        <DownloadEventsBridge />
        <DownloadStatus testId="home-status" />
        <DownloadStatus testId="detail-status" />
      </>,
    )

    await waitFor(() => {
      expect(screen.getByTestId("home-status")).toHaveTextContent("present")
      expect(screen.getByTestId("detail-status")).toHaveTextContent("present")
    })

    await emitGlobalProgress({
      libraryId,
      bookId,
      format,
      status: "remote_only",
      bytesWritten: 0,
    })

    await waitFor(() => {
      expect(screen.getByTestId("home-status")).toHaveTextContent("remote_only")
      expect(screen.getByTestId("detail-status")).toHaveTextContent(
        "remote_only",
      )
    })
    expect(
      client.getQueryData(
        downloadProgressKeys.detail(libraryId, bookId, format),
      ),
    ).not.toMatchObject({ status: "done" })
  })

  it("should restore active download state when entry mounts after download starts", async () => {
    tauriApiMock.checkBookFileState.mockResolvedValue({
      path: "book.epub",
      localState: "downloading",
      localSize: null,
    })
    const client = makeClient()

    renderWithClient(client, <DownloadStatus testId="late-status" />)

    await waitFor(() => {
      expect(screen.getByTestId("late-status")).toHaveTextContent("starting")
    })
  })

  it("should reuse cached file state when entry remounts with same query key", async () => {
    const client = makeClientWithDefaultQueryFreshness()

    const first = renderWithClient(
      client,
      <DownloadStatus testId="first-status" />,
    )

    await waitFor(() => {
      expect(screen.getByTestId("first-status")).toHaveTextContent(
        "remote_only",
      )
    })
    expect(tauriApiMock.checkBookFileState).toHaveBeenCalledTimes(1)

    first.unmount()

    renderWithClient(client, <DownloadStatus testId="second-status" />)

    await waitFor(() => {
      expect(screen.getByTestId("second-status")).toHaveTextContent(
        "remote_only",
      )
    })
    expect(tauriApiMock.checkBookFileState).toHaveBeenCalledTimes(1)
  })

  it("should keep cancellation state when background file state remains active", async () => {
    const client = makeClient()
    client.setQueryData(bookFileStateKeys.detail(libraryId, bookId, format), {
      path: "book.epub",
      localState: "remote_only",
      localSize: null,
    })
    tauriApiMock.checkBookFileState.mockResolvedValue({
      path: "book.epub",
      localState: "downloading",
      localSize: null,
    })

    renderWithClient(
      client,
      <>
        <DownloadEventsBridge />
        <DownloadStatus testId="home-status" />
      </>,
    )

    await waitFor(() => {
      expect(tauriEventMock.listen).toHaveBeenCalledWith(
        "download_progress",
        expect.any(Function),
      )
    })

    await emitGlobalProgress({
      libraryId,
      bookId,
      format,
      status: "cancelled",
      bytesWritten: 0,
    })

    await waitFor(() => {
      expect(
        client.getQueryData<{ localState: string }>(
          bookFileStateKeys.detail(libraryId, bookId, format),
        )?.localState,
      ).toBe("downloading")
    })

    expect(screen.getByTestId("home-status")).toHaveTextContent("remote_only")
  })

  it("should return to remote-only state when download fails", async () => {
    const client = makeClient()
    client.setQueryData(bookFileStateKeys.detail(libraryId, bookId, format), {
      path: "book.epub",
      localState: "remote_only",
      localSize: null,
    })
    tauriApiMock.checkBookFileState.mockResolvedValue({
      path: "book.epub",
      localState: "downloading",
      localSize: null,
    })

    renderWithClient(
      client,
      <>
        <DownloadEventsBridge />
        <DownloadStatus testId="home-status" />
      </>,
    )

    await waitFor(() => {
      expect(tauriEventMock.listen).toHaveBeenCalledWith(
        "download_progress",
        expect.any(Function),
      )
    })

    await emitGlobalProgress({
      libraryId,
      bookId,
      format,
      status: "error",
      bytesWritten: 0,
      error: "network failed",
    })

    await waitFor(() => {
      expect(
        client.getQueryData<{ localState: string }>(
          bookFileStateKeys.detail(libraryId, bookId, format),
        )?.localState,
      ).toBe("downloading")
    })

    expect(screen.getByTestId("home-status")).toHaveTextContent("remote_only")
    expect(toastMock.error).toHaveBeenCalledWith(
      "下载失败",
      expect.objectContaining({ description: "network failed" }),
    )
  })

  it("should remain remote-only when stale file state reports present after failed download", async () => {
    const client = makeClient()
    client.setQueryData(bookFileStateKeys.detail(libraryId, bookId, format), {
      path: "book.epub",
      localState: "remote_only",
      localSize: null,
    })

    renderWithClient(
      client,
      <>
        <DownloadEventsBridge />
        <DownloadStatus testId="home-status" />
      </>,
    )

    await waitFor(() => {
      expect(tauriEventMock.listen).toHaveBeenCalledWith(
        "download_progress",
        expect.any(Function),
      )
    })

    await emitGlobalProgress({
      libraryId,
      bookId,
      format,
      status: "error",
      bytesWritten: 0,
      error: "network failed",
    })

    await waitFor(() => {
      expect(screen.getByTestId("home-status")).toHaveTextContent("remote_only")
    })

    act(() => {
      client.setQueryData(bookFileStateKeys.detail(libraryId, bookId, format), {
        path: "book.epub",
        localState: "present",
        localSize: 12,
      })
    })

    expect(screen.getByTestId("home-status")).toHaveTextContent("remote_only")
  })

  it("should report local-only when a remote copy is pending", async () => {
    tauriApiMock.checkBookFileState.mockResolvedValue({
      path: "book.epub",
      localState: "dirty_push",
      localSize: 1024,
    })
    const client = makeClient()

    renderWithClient(
      client,
      <DownloadStatus testId="local-status" bookUuid="book-uuid" />,
    )

    await waitFor(() => {
      expect(screen.getByTestId("local-status")).toHaveTextContent("local_only")
    })
  })

  it("should show upload progress when a pending local book starts uploading", async () => {
    tauriApiMock.checkBookFileState.mockResolvedValue({
      path: "book.epub",
      localState: "dirty_push",
      localSize: 1024,
    })
    const client = makeClient()

    renderWithClient(
      client,
      <>
        <UploadEventsBridge />
        <DownloadStatus testId="upload-status" bookUuid="book-uuid" />
      </>,
    )

    await waitFor(() => {
      expect(tauriEventMock.listen).toHaveBeenCalledWith(
        "book_upload_progress",
        expect.any(Function),
      )
      expect(screen.getByTestId("upload-status")).toHaveTextContent(
        "local_only",
      )
    })

    await emitUploadProgress({
      libraryId,
      bookUuid: "book-uuid",
      status: "uploading",
      completed: 512,
      total: 1024,
    })

    await waitFor(() => {
      expect(screen.getByTestId("upload-status")).toHaveTextContent("uploading")
    })
    expect(
      client.getQueryData(
        bookUploadProgressKeys.detail(libraryId, "book-uuid"),
      ),
    ).toEqual({ progress: 50 })
    expect(client.getQueryData(pendingBookUploadKeys.list(libraryId))).toEqual([
      "book-uuid",
    ])
    expect(client.getQueryData(localOnlyBookKeys.status(libraryId))).toBe(true)
  })

  it("should refresh remote presence when a pending upload completes", async () => {
    tauriApiMock.checkBookFileState.mockResolvedValue({
      path: "book.epub",
      localState: "dirty_push",
      localSize: 1024,
    })
    const client = makeClient()

    renderWithClient(
      client,
      <>
        <UploadEventsBridge />
        <DownloadStatus testId="completed-status" bookUuid="book-uuid" />
      </>,
    )

    await waitFor(() => {
      expect(screen.getByTestId("completed-status")).toHaveTextContent(
        "local_only",
      )
    })
    await emitUploadProgress({
      libraryId,
      bookUuid: "book-uuid",
      status: "uploading",
      completed: 512,
      total: 1024,
    })
    tauriApiMock.checkBookFileState.mockResolvedValue({
      path: "book.epub",
      localState: "present",
      localSize: 1024,
    })

    await emitUploadProgress({
      libraryId,
      bookUuid: "book-uuid",
      status: "done",
      completed: 1024,
      total: 1024,
    })

    await waitFor(() => {
      expect(screen.getByTestId("completed-status")).toHaveTextContent(
        "present",
      )
    })
    expect(
      client.getQueryData(
        bookUploadProgressKeys.detail(libraryId, "book-uuid"),
      ),
    ).toBeNull()
    expect(client.getQueryData(pendingBookUploadKeys.list(libraryId))).toEqual(
      [],
    )
  })

  it("should retain failed book uploads in the pending collection queue", async () => {
    const client = makeClient()
    renderWithClient(client, <UploadEventsBridge />)

    await waitFor(() => {
      expect(tauriEventMock.listen).toHaveBeenCalledWith(
        "book_upload_progress",
        expect.any(Function),
      )
    })
    await emitUploadProgress({
      libraryId,
      bookUuid: "book-uuid",
      status: "uploading",
      completed: 0,
      total: 0,
    })
    await emitUploadProgress({
      libraryId,
      bookUuid: "book-uuid",
      status: "error",
      completed: 0,
      total: 0,
      error: "offline",
    })

    expect(client.getQueryData(pendingBookUploadKeys.list(libraryId))).toEqual([
      "book-uuid",
    ])
    expect(client.getQueryData(localOnlyBookKeys.status(libraryId))).toBe(true)
  })

  it("should clear pending upload state when library upload fails before a book starts", async () => {
    tauriApiMock.checkBookFileState.mockResolvedValue({
      path: "book.epub",
      localState: "dirty_push",
      localSize: 1024,
    })
    const client = makeClient()

    renderWithClient(
      client,
      <>
        <UploadEventsBridge />
        <DownloadStatus testId="failed-upload-status" bookUuid="book-uuid" />
      </>,
    )

    await emitUploadProgress({
      libraryId,
      bookUuid: "book-uuid",
      status: "uploading",
      completed: 0,
      total: 0,
    })
    await emitUploadProgress({
      libraryId,
      status: "error",
      completed: 0,
      total: 0,
      error: "STORAGE_ERROR: token expired",
    })

    await waitFor(() => {
      expect(screen.getByTestId("failed-upload-status")).toHaveTextContent(
        "local_only",
      )
    })
    expect(
      client.getQueryData(
        bookUploadProgressKeys.detail(libraryId, "book-uuid"),
      ),
    ).toBeNull()
    expect(toastMock.error).toHaveBeenCalledWith(
      "上传失败",
      expect.objectContaining({
        description: "STORAGE_ERROR: token expired",
      }),
    )
  })
})
