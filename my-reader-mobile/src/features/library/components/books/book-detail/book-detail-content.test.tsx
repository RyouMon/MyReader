import { render, screen } from "@testing-library/react-native"

import type { BookDetail } from "@my-reader/tools/types/book"

import type { Library } from "@/src/domain/types"

import { BookDetailContent } from "./book-detail-content"
import type { DetailColors } from "./types"

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
      bookId="1"
      colors={mockColors}
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
  it("should show loading state when loadingDetail is true", () => {
    renderContent({ loadingDetail: true })

    expect(screen.getByText("bookDetail.loadingDetail")).toBeTruthy()
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
})
