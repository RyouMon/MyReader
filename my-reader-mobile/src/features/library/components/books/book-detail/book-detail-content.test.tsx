import { render, screen } from "@testing-library/react-native"

import type { BookDetail } from "@my-reader/tools/types/book"

import type { Library } from "@/src/domain/types"

import { BookDetailContent } from "./book-detail-content"
import type { DetailColors } from "./types"

jest.mock("expo-image", () => {
  const React = jest.requireActual<typeof import("react")>("react")
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native")

  return {
    Image: (props: Record<string, unknown>) => React.createElement(View, props),
  }
})

jest.mock("react-i18next", () => {
  const t = (key: string, params?: Record<string, string>) =>
    params ? `${key}:${JSON.stringify(params)}` : key
  return {
    initReactI18next: { type: "3rdParty", init: jest.fn() },
    useTranslation: () => ({ t }),
  }
})

jest.mock("@/src/utils/book-detail", () => ({
  formatDate: (value: string | null | undefined) => value ?? "—",
  formatLanguage: (value: string) => value,
  IDENTIFIER_LABELS: {},
  resolveCoverForDetail: jest.fn(() => Promise.resolve(undefined)),
  stripHtml: (value: string) => value,
}))

jest.mock("@/src/domain/library/hooks/use-book-reading-progress", () => ({
  useBookReadingProgress: jest.fn(() => ({ data: undefined })),
}))

jest.mock("../../../hooks/use-book-cover-uri", () => ({
  useBookCoverUri: jest.fn(() => ({ coverUri: undefined })),
}))

jest.mock("../../../hooks/use-book-detail-formats", () => ({
  useBookDetailFormats: jest.fn(() => ({
    formatInfoMap: {},
    handleDownloadFormat: jest.fn(),
    handleDeleteFormat: jest.fn(),
    handleShareFormat: jest.fn(),
  })),
}))

jest.mock("../../../hooks/use-book-detail-read-state", () => ({
  useBookDetailReadState: jest.fn(() => ({
    readableFormats: ["EPUB"],
    readableSelectedFormat: "EPUB",
    canReadInApp: true,
    handleReadAction: jest.fn(),
    readButtonTitle: "bookDetail.startReading",
  })),
}))

jest.mock("@/src/components/ui", () => ({
  EmptyState: jest.fn(() => null),
}))

jest.mock("./hero-section", () => ({
  HeroSection: jest.fn(() => null),
}))

jest.mock("./format-section", () => ({
  FormatSection: jest.fn(() => null),
}))

jest.mock("./info-row-section", () => ({
  InfoRowSection: jest.fn(() => null),
}))

jest.mock("./synopsis-section", () => ({
  SynopsisSection: jest.fn(() => null),
}))

const mockColors = {
  background: "#000",
  border: "#333",
  text: "#fff",
  tertiary: "#888",
  muted: "#666",
  accent: "#f00",
  progressTrack: "#222",
  palette: {
    surface: "#111",
    textMuted: "#999",
  },
} as unknown as DetailColors

const localLibrary: Library = {
  id: "lib-1",
  name: "Local Library",
  path: "/local",
  sourceType: "local",
} as Library

const detail = {
  id: 1,
  title: "Test Book",
  titleSort: "Test Book",
  authors: ["Author"],
  authorSort: "Author",
  series: null,
  seriesIndex: null,
  rating: null,
  tags: [],
  identifiers: [],
  languages: ["en"],
  publisher: null,
  timestamp: 0,
  pubdate: null,
  comment: "A synopsis.",
  formats: ["EPUB"],
  formatSizes: [{ format: "EPUB", sizeBytes: 1024 }],
} as unknown as BookDetail

function renderContent(
  overrides: Partial<React.ComponentProps<typeof BookDetailContent>> = {},
) {
  return render(
    <BookDetailContent
      activeLibrary={localLibrary}
      availableWidth={390}
      bookId="1"
      colors={mockColors}
      contentTopInset={0}
      dataSources={[]}
      detail={detail}
      detailError={null}
      listBook={null}
      loadingDetail={false}
      onOpenReader={jest.fn()}
      onSelectFormat={jest.fn()}
      selectedFormat={null}
      {...overrides}
    />,
  )
}

describe("BookDetailContent", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("should show loading state when loadingDetail is true", () => {
    renderContent({ loadingDetail: true })

    expect(
      screen.getByText("bookDetail.loadingDetail").props.className,
    ).toContain("text-base")
  })

  it("should show empty state when detail is missing", () => {
    const { EmptyState } = jest.requireMock("@/src/components/ui")

    renderContent({ detail: null })

    expect(EmptyState.mock.calls[0][0]).toMatchObject({
      title: "bookDetail.notFound.title",
    })
  })

  it("should show error state when detailError is present", () => {
    const { EmptyState } = jest.requireMock("@/src/components/ui")

    renderContent({ detail: null, detailError: "Load failed" })

    expect(
      EmptyState.mock.calls[EmptyState.mock.calls.length - 1][0],
    ).toMatchObject({
      detail: "Load failed",
    })
  })

  it("should render format section when book has formats", () => {
    const { FormatSection } = jest.requireMock("./format-section")

    renderContent()

    expect(FormatSection).toHaveBeenCalled()
  })

  it("should not render a faded cover backdrop in narrow mode", () => {
    const { useBookCoverUri } = jest.requireMock(
      "../../../hooks/use-book-cover-uri",
    )
    useBookCoverUri.mockReturnValueOnce({ coverUri: "file:///cover.jpg" })

    renderContent()

    expect(
      screen.queryByTestId("book-detail-backdrop", {
        includeHiddenElements: true,
      }),
    ).toBeNull()
  })

  it("should preserve the desktop-aligned cover backdrop in wide mode", () => {
    const { useBookCoverUri } = jest.requireMock(
      "../../../hooks/use-book-cover-uri",
    )
    useBookCoverUri.mockReturnValueOnce({ coverUri: "file:///cover.jpg" })

    renderContent({ availableWidth: 834 })

    expect(
      screen.getByTestId("book-detail-backdrop", {
        includeHiddenElements: true,
      }),
    ).toBeTruthy()
  })

  it("should pass current format progress to hero when progress exists", () => {
    const { useBookReadingProgress } = jest.requireMock(
      "@/src/domain/library/hooks/use-book-reading-progress",
    )
    const { HeroSection } = jest.requireMock("./hero-section")
    useBookReadingProgress.mockReturnValueOnce({
      data: { "1": { EPUB: 35 } },
    })

    renderContent()

    expect(HeroSection).toHaveBeenCalledWith(
      expect.objectContaining({ readingProgress: 35 }),
      undefined,
    )
  })

  it("should pass measured content width to hero when layout is wide", () => {
    const { HeroSection } = jest.requireMock("./hero-section")

    renderContent({ availableWidth: 834 })

    expect(HeroSection).toHaveBeenCalledWith(
      expect.objectContaining({ availableWidth: 834 }),
      undefined,
    )
  })

  it("should remove automatic top inset when content width is narrow", () => {
    renderContent({ availableWidth: 390 })

    expect(
      screen.getByTestId("book-detail-scroll-view").props
        .contentInsetAdjustmentBehavior,
    ).toBe("never")
  })

  it("should preserve automatic inset when content width is wide", () => {
    renderContent({ availableWidth: 834 })

    expect(
      screen.getByTestId("book-detail-scroll-view").props
        .contentInsetAdjustmentBehavior,
    ).toBe("automatic")
  })

  it("should apply an explicit top inset when the platform requires it", () => {
    renderContent({ availableWidth: 834, contentTopInset: 64 })

    expect(
      screen.getByTestId("book-detail-scroll-view").props.contentContainerStyle,
    ).toEqual({ paddingTop: 64 })
  })

  it("should preserve detailed information section when hero changes", () => {
    const { InfoRowSection } = jest.requireMock("./info-row-section")

    renderContent()

    expect(InfoRowSection).toHaveBeenCalled()
  })
})
