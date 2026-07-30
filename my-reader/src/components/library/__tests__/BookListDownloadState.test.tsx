import "@/i18n"
import type { CalibreBook } from "@my-reader/tools/types/book"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { useBookFileStates } from "@/hooks/queries/useBookFileState"
import BookCard from "../BookCard"
import BookRow from "../BookRow"

const tauriApiMock = vi.hoisted(() => ({
  checkBookFileState: vi.fn(),
  checkBookFileStates: vi.fn(),
}))

vi.mock("@/lib/tauri-api", () => ({
  api: tauriApiMock,
}))

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
}

function renderWithClient(client: QueryClient, children: ReactNode) {
  return render(
    <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  )
}

function makeBook(): CalibreBook {
  return {
    id: 42,
    title: "Night Bookstore",
    authorSort: "Shen Yao",
    authors: ["Shen Yao"],
    tags: [],
    series: null,
    seriesIndex: null,
    formats: ["EPUB"],
    readableFormats: ["EPUB"],
    preferredFormat: "EPUB",
    hasCover: false,
    path: "Night Bookstore/Night Bookstore.epub",
    timestamp: null,
    pubdate: null,
    lastModified: null,
    comment: null,
    publisher: null,
    languages: [],
    rating: null,
    uuid: "book-42",
  }
}

function getRemoteOnlyIndicator() {
  return document.querySelector('[data-download-status="remote_only"]')
}

function PrefetchedBookCard() {
  useBookFileStates("lib-1", [{ bookId: 42, format: "EPUB" }])
  return (
    <BookCard
      book={makeBook()}
      libraryId="lib-1"
      fileStateSource="prefetched"
    />
  )
}

describe("library list download state", () => {
  afterEach(() => {
    tauriApiMock.checkBookFileState.mockReset()
    tauriApiMock.checkBookFileStates.mockReset()
  })

  it("should query file state when book card mounts", async () => {
    tauriApiMock.checkBookFileState.mockResolvedValue({
      path: "book.epub",
      localState: "remote_only",
      localSize: null,
    })

    renderWithClient(
      makeClient(),
      <BookCard book={makeBook()} libraryId="lib-1" />,
    )

    await waitFor(() => {
      expect(tauriApiMock.checkBookFileState).toHaveBeenCalledWith(
        "lib-1",
        42,
        "EPUB",
      )
    })
    await waitFor(() => {
      expect(getRemoteOnlyIndicator()).toBeInTheDocument()
    })
  })

  it("should query file state when book row mounts", async () => {
    tauriApiMock.checkBookFileState.mockResolvedValue({
      path: "book.epub",
      localState: "remote_only",
      localSize: null,
    })

    renderWithClient(
      makeClient(),
      <BookRow book={makeBook()} libraryId="lib-1" />,
    )

    await waitFor(() => {
      expect(tauriApiMock.checkBookFileState).toHaveBeenCalledWith(
        "lib-1",
        42,
        "EPUB",
      )
    })
    await waitFor(() => {
      expect(getRemoteOnlyIndicator()).toBeInTheDocument()
    })
  })

  it("should reuse cached file state when book card remounts", async () => {
    const client = makeClient()
    tauriApiMock.checkBookFileState.mockResolvedValue({
      path: "book.epub",
      localState: "remote_only",
      localSize: null,
    })

    const first = renderWithClient(
      client,
      <BookCard book={makeBook()} libraryId="lib-1" />,
    )

    await waitFor(() => {
      expect(tauriApiMock.checkBookFileState).toHaveBeenCalledTimes(1)
    })

    first.unmount()
    renderWithClient(client, <BookCard book={makeBook()} libraryId="lib-1" />)

    await waitFor(() => {
      expect(getRemoteOnlyIndicator()).toBeInTheDocument()
    })

    expect(tauriApiMock.checkBookFileState).toHaveBeenCalledTimes(1)
  })

  it("should use batch file state when book card receives prefetched state", async () => {
    tauriApiMock.checkBookFileStates.mockResolvedValue([
      {
        bookId: 42,
        format: "EPUB",
        path: "book.epub",
        localState: "remote_only",
        localSize: null,
      },
    ])

    renderWithClient(makeClient(), <PrefetchedBookCard />)

    await waitFor(() => {
      expect(tauriApiMock.checkBookFileStates).toHaveBeenCalledWith("lib-1", [
        { bookId: 42, format: "EPUB" },
      ])
    })
    await waitFor(() => {
      expect(getRemoteOnlyIndicator()).toBeInTheDocument()
    })
    expect(tauriApiMock.checkBookFileState).not.toHaveBeenCalled()
  })
})
