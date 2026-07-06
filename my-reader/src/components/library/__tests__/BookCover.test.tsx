import type { CalibreBook } from "@my-reader/tools/types/book"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { BookCover, resetBrokenCovers } from "../BookCover"

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

describe("BookCover", () => {
  afterEach(() => {
    act(() => {
      resetBrokenCovers()
    })
  })

  it("should show Skeleton when an expected cover is loading", () => {
    const book = makeBook()
    const { container } = render(<BookCover book={book} libraryId="lib-1" />)
    const skeleton = container.querySelector('[data-slot="skeleton"]')

    expect(skeleton).not.toBeNull()
    expect(skeleton as HTMLElement).toHaveClass("animate-pulse")
    expect(skeleton as HTMLElement).toHaveClass("bg-muted-foreground/25")
    expect(skeleton as HTMLElement).not.toHaveClass("bg-muted")
    expect(screen.getByAltText(book.title)).toBeInTheDocument()
    expect(screen.queryByText(book.title)).not.toBeInTheDocument()
  })

  it("should probe an unknown cover when probing is enabled", async () => {
    const book = makeBook({ hasCover: false })
    const { container } = render(
      <BookCover book={book} libraryId="lib-1" probeCoverWhenUnknown />,
    )

    expect(container.querySelector('[data-slot="skeleton"]')).not.toBeNull()
    expect(screen.getByAltText(book.title)).toBeInTheDocument()
    expect(screen.queryByText(book.title)).not.toBeInTheDocument()

    act(() => {
      fireEvent.error(screen.getByAltText(book.title))
    })

    await waitFor(() => {
      expect(container.querySelector('[data-slot="skeleton"]')).toBeNull()
      expect(screen.getByText(book.title)).toBeInTheDocument()
    })
  })

  it("should allow expected cover when a previous unknown-cover probe failed", async () => {
    const unknownBook = makeBook({ hasCover: false })
    const { container, rerender } = render(
      <BookCover book={unknownBook} libraryId="lib-1" probeCoverWhenUnknown />,
    )

    act(() => {
      fireEvent.error(screen.getByAltText(unknownBook.title))
    })

    await waitFor(() => {
      expect(container.querySelector('[data-slot="skeleton"]')).toBeNull()
      expect(screen.getByText(unknownBook.title)).toBeInTheDocument()
    })

    const expectedBook = makeBook({ hasCover: true })
    rerender(<BookCover book={expectedBook} libraryId="lib-1" />)

    expect(container.querySelector('[data-slot="skeleton"]')).not.toBeNull()
    expect(screen.getByAltText(expectedBook.title)).toBeInTheDocument()
    expect(screen.queryByText(expectedBook.title)).not.toBeInTheDocument()
  })

  it("should show fallback when cover loading fails", async () => {
    const book = makeBook()
    const { container } = render(<BookCover book={book} libraryId="lib-1" />)

    act(() => {
      fireEvent.error(screen.getByAltText(book.title))
    })

    await waitFor(() => {
      expect(container.querySelector('[data-slot="skeleton"]')).toBeNull()
      expect(screen.getByText(book.title)).toBeInTheDocument()
    })
  })

  it("should retry failed cover when broken-cover cache is reset", async () => {
    const book = makeBook()
    const { container } = render(<BookCover book={book} libraryId="lib-1" />)

    act(() => {
      fireEvent.error(screen.getByAltText(book.title))
    })

    await waitFor(() => {
      expect(container.querySelector('[data-slot="skeleton"]')).toBeNull()
      expect(screen.getByText(book.title)).toBeInTheDocument()
    })

    act(() => {
      resetBrokenCovers()
    })

    await waitFor(() => {
      expect(container.querySelector('[data-slot="skeleton"]')).not.toBeNull()
      expect(screen.getByAltText(book.title)).toBeInTheDocument()
      expect(screen.queryByText(book.title)).not.toBeInTheDocument()
    })
  })

  it("should keep loaded cover visible when another cover fails", async () => {
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

    act(() => {
      fireEvent.load(screen.getByAltText(loadedBook.title))
    })

    await waitFor(() => {
      expect(
        getByTestId("loaded-cover").querySelector('[data-slot="skeleton"]'),
      ).toBeNull()
      expect(screen.getByAltText(loadedBook.title)).not.toHaveClass("opacity-0")
    })

    act(() => {
      fireEvent.error(screen.getByAltText(failingBook.title))
    })

    await waitFor(() => {
      expect(
        getByTestId("loaded-cover").querySelector('[data-slot="skeleton"]'),
      ).toBeNull()
      expect(screen.getByAltText(loadedBook.title)).not.toHaveClass("opacity-0")
    })
  })

  it("should show fallback immediately when book has no cover and probing is disabled", () => {
    const book = makeBook({ hasCover: false })
    const { container } = render(<BookCover book={book} libraryId="lib-1" />)

    expect(container.querySelector('[data-slot="skeleton"]')).toBeNull()
    expect(screen.getByText(book.title)).toBeInTheDocument()
  })
})
