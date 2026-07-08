import type { CalibreBook } from "@my-reader/tools/types/book"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { resetCoverObjectUrlCache } from "@/lib/coverObjectUrlCache"
import { BookCover, resetBrokenCovers } from "../BookCover"

const fetchMock = vi.fn()
const createObjectURLMock = vi.fn()
const revokeObjectURLMock = vi.fn()

function makeBook(patch: Partial<CalibreBook> = {}): CalibreBook {
  return {
    id: 1,
    title: "Night Bookstore",
    authorSort: "Shen Yao",
    authors: ["Shen Yao"],
    tags: [],
    series: null,
    seriesIndex: null,
    formats: ["EPUB"],
    hasCover: true,
    path: "Night Bookstore/Night Bookstore.epub",
    timestamp: null,
    pubdate: null,
    lastModified: null,
    comment: null,
    publisher: null,
    languages: [],
    rating: null,
    uuid: null,
    ...patch,
  }
}

function makeCoverResponse(): Pick<Response, "ok" | "status" | "blob"> {
  return {
    ok: true,
    status: 200,
    blob: () => Promise.resolve(new Blob(["cover"], { type: "image/jpeg" })),
  }
}

async function waitForCoverImage(title: string) {
  const image = await screen.findByAltText(title)
  act(() => {
    fireEvent.load(image)
  })
  return image
}

describe("BookCover", () => {
  beforeEach(() => {
    fetchMock.mockResolvedValue(makeCoverResponse())
    createObjectURLMock.mockImplementation(
      () => `blob:cover-${createObjectURLMock.mock.calls.length}`,
    )
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: fetchMock,
    })
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectURLMock,
    })
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURLMock,
    })
  })

  afterEach(() => {
    act(() => {
      resetBrokenCovers()
      resetCoverObjectUrlCache()
    })
    fetchMock.mockReset()
    createObjectURLMock.mockReset()
    revokeObjectURLMock.mockReset()
  })

  it("should show Skeleton when an expected cover is loading", () => {
    fetchMock.mockReturnValue(new Promise(() => {}))
    const book = makeBook()
    const { container } = render(<BookCover book={book} libraryId="lib-1" />)
    const skeleton = container.querySelector('[data-slot="skeleton"]')

    expect(skeleton).not.toBeNull()
    expect(skeleton as HTMLElement).toHaveClass("animate-pulse")
    expect(skeleton as HTMLElement).toHaveClass("bg-muted-foreground/25")
    expect(skeleton as HTMLElement).not.toHaveClass("bg-muted")
    expect(screen.queryByAltText(book.title)).not.toBeInTheDocument()
    expect(screen.queryByText(book.title)).not.toBeInTheDocument()
  })

  it("should load and reuse a cached cover object URL", async () => {
    const book = makeBook()
    const first = render(<BookCover book={book} libraryId="lib-1" />)

    const firstImage = await waitForCoverImage(book.title)
    expect(firstImage).toHaveAttribute("src", "blob:cover-1")
    expect(fetchMock).toHaveBeenCalledTimes(1)

    first.unmount()
    render(<BookCover book={book} libraryId="lib-1" />)

    const secondImage = screen.getByAltText(book.title)
    expect(secondImage).toHaveAttribute("src", "blob:cover-1")
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("should probe an unknown cover when probing is enabled", async () => {
    const book = makeBook({ hasCover: false })
    const { container } = render(
      <BookCover book={book} libraryId="lib-1" probeCoverWhenUnknown />,
    )

    expect(container.querySelector('[data-slot="skeleton"]')).not.toBeNull()
    expect(screen.queryByText(book.title)).not.toBeInTheDocument()

    await waitForCoverImage(book.title)

    await waitFor(() => {
      expect(container.querySelector('[data-slot="skeleton"]')).toBeNull()
    })
  })

  it("should allow expected cover when a previous unknown-cover probe failed", async () => {
    fetchMock
      .mockRejectedValueOnce(new Error("missing"))
      .mockResolvedValue(makeCoverResponse())
    const unknownBook = makeBook({ hasCover: false })
    const { container, rerender } = render(
      <BookCover book={unknownBook} libraryId="lib-1" probeCoverWhenUnknown />,
    )

    await waitFor(() => {
      expect(container.querySelector('[data-slot="skeleton"]')).toBeNull()
      expect(screen.getByText(unknownBook.title)).toBeInTheDocument()
    })

    const expectedBook = makeBook({ hasCover: true })
    rerender(<BookCover book={expectedBook} libraryId="lib-1" />)

    expect(container.querySelector('[data-slot="skeleton"]')).not.toBeNull()
    await waitForCoverImage(expectedBook.title)
    expect(screen.queryByText(expectedBook.title)).not.toBeInTheDocument()
  })

  it("should show fallback when cover loading fails", async () => {
    fetchMock.mockRejectedValue(new Error("not found"))
    const book = makeBook()
    const { container } = render(<BookCover book={book} libraryId="lib-1" />)

    await waitFor(() => {
      expect(container.querySelector('[data-slot="skeleton"]')).toBeNull()
      expect(screen.getByText(book.title)).toHaveClass("text-cover-fg")
      expect(screen.getByText(book.authors[0])).toHaveClass("text-cover-muted")
    })
  })

  it("should retry failed cover when broken-cover cache is reset", async () => {
    fetchMock
      .mockRejectedValueOnce(new Error("not found"))
      .mockResolvedValue(makeCoverResponse())
    const book = makeBook()
    const { container } = render(<BookCover book={book} libraryId="lib-1" />)

    await waitFor(() => {
      expect(container.querySelector('[data-slot="skeleton"]')).toBeNull()
      expect(screen.getByText(book.title)).toBeInTheDocument()
    })

    act(() => {
      resetBrokenCovers()
    })

    await waitFor(() => {
      expect(container.querySelector('[data-slot="skeleton"]')).not.toBeNull()
    })
    await waitForCoverImage(book.title)
  })

  it("should keep loaded cover visible when another cover fails", async () => {
    fetchMock
      .mockResolvedValueOnce(makeCoverResponse())
      .mockRejectedValueOnce(new Error("missing"))
    const loadedBook = makeBook({
      id: 1,
      title: "Loaded Cover",
      path: "Books/Loaded.epub",
    })
    const failingBook = makeBook({
      id: 2,
      title: "Failing Cover",
      path: "Books/Failing.epub",
    })
    const { getByTestId } = render(
      <div>
        <div data-testid="loaded-cover">
          <BookCover book={loadedBook} libraryId="lib-1" />
        </div>
        <div data-testid="failing-cover">
          <BookCover book={failingBook} libraryId="lib-1" />
        </div>
      </div>,
    )

    await waitForCoverImage(loadedBook.title)

    await waitFor(() => {
      expect(
        getByTestId("loaded-cover").querySelector('[data-slot="skeleton"]'),
      ).toBeNull()
      expect(screen.getByAltText(loadedBook.title)).not.toHaveClass("opacity-0")
      expect(screen.getByText(failingBook.title)).toBeInTheDocument()
    })
  })

  it("should show fallback immediately when book has no cover and probing is disabled", () => {
    const book = makeBook({ hasCover: false })
    const { container } = render(<BookCover book={book} libraryId="lib-1" />)

    expect(container.querySelector('[data-slot="skeleton"]')).toBeNull()
    expect(screen.getByText(book.title)).toHaveClass("text-cover-fg")
    expect(screen.getByText(book.authors[0])).toHaveClass("text-cover-muted")
  })
})
