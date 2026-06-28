import { render, screen } from "@testing-library/react-native"

import type { BookItem } from "@/src/domain/types"

import { ReadingListCard } from "./reading-list-card"

jest.mock("@react-native-menu/menu", () => ({
  MenuView: jest.fn(({ children }) => children),
}))

jest.mock("@/src/features/library/components/books/book-cover", () => ({
  BookCover: jest.fn(() => null),
}))

jest.mock("@/src/components/book-download-status-indicator", () => ({
  BookDownloadStatusIndicator: jest.fn(() => null),
}))

jest.mock("@/src/components/cover-adaptive-background", () => ({
  CoverAdaptiveBackground: jest.fn(() => null),
}))

jest.mock("@/src/components/ui/more-actions-icon", () => ({
  MoreActionsIcon: jest.fn(() => null),
}))

jest.mock("@/src/domain/library/hooks/use-cover-palette", () => ({
  useCoverPalette: jest.fn(() => ({ raw: {} })),
}))

jest.mock("@/src/design/press-feedback", () => ({
  androidRippleColor: jest.fn(() => "transparent"),
  pressedBackgroundColor: jest.fn(() => "transparent"),
}))

jest.mock("@/src/design/tokens", () => ({
  useTheme: jest.fn(() => ({ colorScheme: "light" })),
  useThemePalette: jest.fn(() => ({
    text: "#000",
    textMuted: "#666",
    surface: "#fff",
    border: "#ccc",
  })),
}))

jest.mock("react-i18next", () => ({
  initReactI18next: { type: "3rdParty", init: jest.fn() },
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
  }),
}))

const baseBook = {
  id: "1",
  title: "Test Book",
  author: "Author",
  coverUri: "file:///cover.jpg",
  readingFormat: "EPUB",
} as unknown as BookItem & { readingFormat?: string }

describe("ReadingListCard", () => {
  it("should render menu trigger without responder wrapper", () => {
    render(
      <ReadingListCard
        book={baseBook}
        width={200}
        progress={35}
        menuIsRemote={false}
        onMenuAction={jest.fn()}
      />,
    )

    const trigger = screen.getByLabelText(
      'bookDetail.moreActions:{"title":"Test Book"}',
    )

    expect(
      trigger.parent?.parent?.props?.onStartShouldSetResponder,
    ).toBeUndefined()
  })
})
