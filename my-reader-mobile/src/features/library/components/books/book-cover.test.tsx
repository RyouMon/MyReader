import { act, render, screen } from "@testing-library/react-native"

import type { BookItem } from "@/src/domain/types"
import {
  createCoverThumbnailSessionIdentity,
  resetCoverThumbnailSessionStoreForTests,
  setCoverThumbnailSessionEntries,
} from "../../cover-thumbnail-session-store"

import { BookCover, resetCoverImageDisplayStoreForTests } from "./book-cover"

jest.mock("@/src/design/tokens", () => ({
  useThemePalette: jest.fn(() => ({
    backgroundSecondary: "#f2efe8",
    surface: "#faf5ef",
    text: "#1f1a17",
    textOnPrimary: "#fff8ee",
  })),
}))

const baseBook: BookItem = {
  id: "book-1",
  title: "Fallback Book",
  author: "Author",
}

describe("BookCover", () => {
  beforeEach(() => {
    resetCoverThumbnailSessionStoreForTests()
    resetCoverImageDisplayStoreForTests()
  })

  it("renders default cover art when no cover is available", () => {
    render(<BookCover book={baseBook} width={100} height={150} />)

    expect(screen.getByText("Fallback Book")).toBeTruthy()
    expect(screen.getByText("Author")).toBeTruthy()
  })

  it("removes loading skeleton after the image displays", () => {
    render(
      <BookCover
        book={{ ...baseBook, coverUri: "https://example.com/cover.png" }}
        width={100}
        height={150}
      />,
    )

    const image = screen.getByTestId("book-cover-image-book-1")

    expect(screen.getByTestId("book-cover-loading-book-1")).toBeTruthy()
    expect(screen.queryByText("Fallback Book")).toBeNull()
    expect(screen.queryByText("Author")).toBeNull()

    act(() => {
      image.props.onDisplay()
    })

    expect(screen.queryByTestId("book-cover-loading-book-1")).toBeNull()
    expect(screen.queryByText("Fallback Book")).toBeNull()
    expect(screen.queryByText("Author")).toBeNull()
  })

  it("renders a previously displayed cover without fallback art", () => {
    const coverUri = "https://example.com/cover.png"
    const firstRender = render(
      <BookCover book={{ ...baseBook, coverUri }} width={100} height={150} />,
    )

    act(() => {
      screen.getByTestId("book-cover-image-book-1").props.onDisplay()
    })
    firstRender.unmount()

    render(
      <BookCover book={{ ...baseBook, coverUri }} width={100} height={150} />,
    )

    expect(screen.queryByText("Fallback Book")).toBeNull()
    expect(screen.queryByTestId("book-cover-loading-book-1")).toBeNull()
    expect(
      screen.getByTestId("book-cover-image-book-1").props.transition,
    ).toBeNull()
  })

  it("uses a display cover URI instead of the original cover URI", () => {
    render(
      <BookCover
        book={{ ...baseBook, coverUri: "https://example.com/original.jpg" }}
        displayCoverUri="file:///cache/thumb.jpg"
        width={100}
        height={150}
      />,
    )

    expect(screen.getByTestId("book-cover-image-book-1").props.source).toEqual([
      { uri: "file:///cache/thumb.jpg" },
    ])
  })

  it("cross-dissolves from loading art to the loaded image", () => {
    render(
      <BookCover
        book={{ ...baseBook, coverUri: "https://example.com/original.jpg" }}
        displayCoverUri="file:///cache/thumb.jpg"
        width={100}
        height={150}
      />,
    )

    expect(
      screen.getByTestId("book-cover-image-book-1").props.transition,
    ).toEqual({ duration: 140 })
  })

  it("can defer image rendering until the display cover URI is ready", () => {
    render(
      <BookCover
        book={{ ...baseBook, coverUri: "https://example.com/original.jpg" }}
        deferCoverUntilDisplayUri
        width={100}
        height={150}
      />,
    )

    expect(screen.queryByTestId("book-cover-image-book-1")).toBeNull()
    expect(screen.getByTestId("book-cover-loading-book-1")).toBeTruthy()
    expect(screen.queryByText("Fallback Book")).toBeNull()
  })

  it("subscribes to the thumbnail session URI for list covers", () => {
    const scopeKey = "library-1:200x300"
    const book = {
      ...baseBook,
      coverUri: "https://example.com/original.jpg",
      timestamp: "cover-version-1",
    }

    render(
      <BookCover
        book={book}
        thumbnailScopeKey={scopeKey}
        deferCoverUntilDisplayUri
        width={100}
        height={150}
      />,
    )

    expect(screen.queryByTestId("book-cover-image-book-1")).toBeNull()
    expect(screen.getByTestId("book-cover-loading-book-1")).toBeTruthy()

    act(() => {
      setCoverThumbnailSessionEntries(scopeKey, [
        {
          bookId: book.id,
          identity: createCoverThumbnailSessionIdentity(scopeKey, book)!,
          uri: "file:///cache/thumb.jpg",
        },
      ])
    })

    expect(screen.getByTestId("book-cover-image-book-1").props.source).toEqual([
      { uri: "file:///cache/thumb.jpg" },
    ])
    expect(screen.getByTestId("book-cover-loading-book-1")).toBeTruthy()
  })

  it("falls back to default cover art when image loading fails", () => {
    render(
      <BookCover
        book={{ ...baseBook, coverUri: "https://example.com/cover.png" }}
        width={100}
        height={150}
      />,
    )

    act(() => {
      screen
        .getByTestId("book-cover-image-book-1")
        .props.onError({ nativeEvent: { error: "failed" } })
    })

    expect(screen.getByText("Fallback Book")).toBeTruthy()
    expect(screen.getByText("Author")).toBeTruthy()
    expect(screen.queryByTestId("book-cover-image-book-1")).toBeNull()
  })
})
