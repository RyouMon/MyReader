import { act, render, screen } from "@testing-library/react-native"

import type { BookItem } from "@/src/domain/types"

import { BookCover } from "./book-cover"

jest.mock("@/src/design/tokens", () => ({
  useThemePalette: jest.fn(() => ({
    backgroundSecondary: "#f2efe8",
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
  it("renders default cover art when no cover is available", () => {
    render(<BookCover book={baseBook} width={100} height={150} />)

    expect(screen.getByText("Fallback Book")).toBeTruthy()
    expect(screen.getByText("Author")).toBeTruthy()
  })

  it("keeps default cover art behind the image without display state updates", () => {
    render(
      <BookCover
        book={{ ...baseBook, coverUri: "https://example.com/cover.png" }}
        width={100}
        height={150}
      />,
    )

    const image = screen.getByTestId("book-cover-image-book-1")

    expect(screen.getByText("Fallback Book")).toBeTruthy()
    expect(screen.getByText("Author")).toBeTruthy()
    expect(image.props.onDisplay).toBeUndefined()
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
