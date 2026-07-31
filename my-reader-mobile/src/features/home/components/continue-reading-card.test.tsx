import { render, screen } from "@testing-library/react-native"

import type { BookItem } from "@/src/domain/types"
import {
  createCoverThumbnailSessionIdentity,
  resetCoverThumbnailSessionStoreForTests,
  setCoverThumbnailSessionEntries,
} from "@/src/features/library/cover-thumbnail-session-store"

import { ContinueReadingCard } from "./continue-reading-card"

jest.mock("@react-native-menu/menu", () => ({
  MenuView: jest.fn(({ children }) => children),
}))

jest.mock("@/src/components", () => ({
  HeroCard: jest.fn(({ children }) => children),
  ProgressBar: jest.fn(() => null),
}))

jest.mock("@/src/components/ui/more-actions-icon", () => ({
  MoreActionsIcon: jest.fn(() => null),
}))

jest.mock("@/src/components/cover-adaptive-background", () => ({
  CoverAdaptiveBackground: jest.fn(() => null),
}))

jest.mock("@/src/components/book-download-status-indicator", () => ({
  BookDownloadStatusIndicator: jest.fn(() => null),
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
    backgroundSecondary: "#fff",
    text: "#000",
    textMuted: "#666",
    background: "#fff",
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
  readingProgress: 35,
  readingFormat: "EPUB",
} as unknown as BookItem & { readingProgress: number; readingFormat: string }

describe("ContinueReadingCard", () => {
  beforeEach(() => {
    resetCoverThumbnailSessionStoreForTests()
    jest.clearAllMocks()
  })

  it("should reuse the cached thumbnail across the home cover surfaces when available", () => {
    const scopeKey = "library-1:300x450"
    const thumbnailUri = "file:///cache/cover-thumbnail.jpg"
    setCoverThumbnailSessionEntries(scopeKey, [
      {
        bookId: baseBook.id,
        identity: createCoverThumbnailSessionIdentity(scopeKey, baseBook)!,
        uri: thumbnailUri,
      },
    ])
    render(<ContinueReadingCard book={baseBook} thumbnailScopeKey={scopeKey} />)

    expect(screen.getByTestId("book-cover-image-1").props.source).toEqual([
      { uri: thumbnailUri },
    ])
    const { CoverAdaptiveBackground } = jest.requireMock(
      "@/src/components/cover-adaptive-background",
    )
    expect(CoverAdaptiveBackground).toHaveBeenCalledWith(
      expect.objectContaining({ coverUri: thumbnailUri }),
      undefined,
    )
    const { useCoverPalette } = jest.requireMock(
      "@/src/domain/library/hooks/use-cover-palette",
    )
    expect(useCoverPalette).toHaveBeenCalledWith(thumbnailUri, "light")
  })

  it("should render menu trigger without responder wrapper when rendering card menu actions", () => {
    render(
      <ContinueReadingCard
        book={baseBook}
        menuActions={[{ id: "favorite", title: "Favorite" }]}
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
