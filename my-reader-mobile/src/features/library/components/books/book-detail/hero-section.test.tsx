import { fireEvent, render, screen } from "@testing-library/react-native"
import { StyleSheet } from "react-native"

import type { BookDetail } from "@my-reader/tools/types/book"

import { HeroSection } from "./hero-section"
import {
  resolveBookDetailContentTopInset,
  resolveBookDetailHeroMode,
  resolveNarrowBookDetailCoverHeight,
} from "./hero-layout"
import type { DetailColors } from "./types"

jest.mock("react-i18next", () => ({
  initReactI18next: { type: "3rdParty", init: jest.fn() },
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
  }),
}))

jest.mock("@/src/utils/book-detail", () => ({
  extractYear: () => "2025",
  formatDate: (value: string) => value,
  formatLanguage: (value: string) => value,
}))

jest.mock("expo-linear-gradient", () => {
  const React = jest.requireActual<typeof import("react")>("react")
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native")

  return {
    LinearGradient: (props: Record<string, unknown>) =>
      React.createElement(View, props),
  }
})

jest.mock("@react-native-menu/menu", () => {
  const React = jest.requireActual<typeof import("react")>("react")
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native")

  return {
    MenuView: jest.fn(({ children, ...props }: { children: React.ReactNode }) =>
      React.createElement(View, props, children),
    ),
  }
})

jest.mock("@/src/components/ui", () => {
  const React = jest.requireActual<typeof import("react")>("react")
  const { Pressable, Text } =
    jest.requireActual<typeof import("react-native")>("react-native")

  return {
    Button: jest.fn(
      ({
        accessibilityLabel,
        onPress,
        title,
      }: {
        accessibilityLabel: string
        onPress: () => void
        title: string
      }) =>
        React.createElement(
          Pressable,
          {
            accessibilityLabel,
            accessibilityRole: "button",
            onPress,
          },
          React.createElement(Text, null, title),
        ),
    ),
    CircularProgress: jest.fn(() => null),
  }
})

jest.mock("../book-cover", () => {
  const React = jest.requireActual<typeof import("react")>("react")
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native")

  return {
    BookCover: jest.fn(() =>
      React.createElement(View, { testID: "book-cover" }),
    ),
  }
})

const detail = {
  id: 1,
  title: "A Complete Book Title",
  titleSort: "A Complete Book Title",
  authors: ["Author"],
  authorSort: "Author",
  series: "Series",
  seriesIndex: 2,
  rating: null,
  tags: ["Tag"],
  identifiers: [],
  languages: ["eng"],
  publisher: "Publisher",
  timestamp: "2026-01-01",
  pubdate: "2025-06-01",
  comment: "Synopsis",
  formats: ["EPUB", "PDF"],
  formatSizes: [],
} as unknown as BookDetail

const colors = {
  accent: "#c4622d",
  accentPressed: "#b05523",
  accentText: "#faf6f0",
  background: "#f5efe6",
  border: "#ddd2c0",
  muted: "#7a6b5d",
  progressTrack: "#ddd2c0",
  text: "#3b2f2f",
  palette: {
    background: "#f5efe6",
    overlay: "rgba(28,23,20,0.22)",
    overlayStrong: "rgba(28,23,20,0.50)",
  },
} as unknown as DetailColors

function renderHero(
  availableWidth: number,
  overrides: Partial<React.ComponentProps<typeof HeroSection>> = {},
) {
  const onRead = jest.fn()
  const onSetFormat = jest.fn()

  render(
    <HeroSection
      availableWidth={availableWidth}
      book={detail}
      canReadInApp
      colors={colors}
      formats={["EPUB", "PDF"]}
      onRead={onRead}
      onSetFormat={onSetFormat}
      readingProgress={35}
      readButtonTitle="bookDetail.startReading"
      selectedFormat="EPUB"
      {...overrides}
    />,
  )

  return { onRead, onSetFormat }
}

describe("resolveBookDetailHeroMode", () => {
  it("should use narrow mode when available width is 559dp", () => {
    expect(resolveBookDetailHeroMode(559)).toBe("narrow")
  })

  it("should use wide mode when available width is 560dp", () => {
    expect(resolveBookDetailHeroMode(560)).toBe("wide")
  })

  it("should inset Android wide content below the transparent header", () => {
    expect(resolveBookDetailContentTopInset("android", "wide", 64)).toBe(64)
    expect(resolveBookDetailContentTopInset("android", "narrow", 64)).toBe(0)
    expect(resolveBookDetailContentTopInset("ios", "wide", 64)).toBe(0)
  })

  it("should grow the narrow cover stage when font scale increases", () => {
    expect(resolveNarrowBookDetailCoverHeight(320, 2)).toBeGreaterThan(
      resolveNarrowBookDetailCoverHeight(320, 1),
    )
  })
})

describe("HeroSection", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("should use the cached thumbnail as the detail cover placeholder when available", () => {
    const { BookCover } = jest.requireMock("../book-cover")

    renderHero(390, { thumbnailScopeKey: "library-1:300x450" })

    expect(BookCover).toHaveBeenCalledWith(
      expect.objectContaining({
        book: expect.objectContaining({ timestamp: detail.timestamp }),
        thumbnailScopeKey: "library-1:300x450",
        thumbnailUsage: "placeholder",
      }),
      undefined,
    )
  })

  it("should render narrow hero when available width is below the breakpoint", () => {
    renderHero(390)

    expect(screen.getByTestId("book-detail-hero-narrow")).toBeTruthy()
    expect(screen.queryByTestId("book-detail-hero-wide")).toBeNull()
  })

  it("should keep the upper cover original and transition directly into the page background", () => {
    renderHero(390)

    expect(
      screen.getByTestId("book-detail-cover-transition").props,
    ).toMatchObject({
      colors: [
        "transparent",
        "transparent",
        colors.palette.overlayStrong,
        colors.background,
      ],
      locations: [0, 0.48, 0.76, 1],
    })
    expect(
      screen.getByTestId("book-detail-narrow-details").props.style,
    ).toMatchObject({
      backgroundColor: colors.background,
    })
  })

  it("should use a compact progress ring in narrow mode", () => {
    const { CircularProgress } = jest.requireMock("@/src/components/ui")

    renderHero(390)

    expect(CircularProgress).toHaveBeenCalledWith(
      expect.objectContaining({ size: 56, strokeWidth: 3 }),
      undefined,
    )
  })

  it("should keep the narrow title close to the author region", () => {
    renderHero(390)

    expect(screen.getByTestId("book-detail-cover-title").props.style).toEqual(
      expect.objectContaining({ bottom: 32 }),
    )
  })

  it("should use active theme colors without outlines when the narrow hero is light", () => {
    renderHero(390)

    const titleStyle = StyleSheet.flatten(
      screen.getByTestId("book-detail-title").props.style,
    )
    const seriesStyle = StyleSheet.flatten(
      screen.getByText('bookDetail.seriesInfo:{"series":"Series","index":"2"}')
        .props.style,
    )

    expect(titleStyle).toMatchObject({ color: colors.text })
    expect(titleStyle).not.toHaveProperty("textShadowColor")
    expect(seriesStyle).toMatchObject({ color: colors.muted })
    expect(seriesStyle).not.toHaveProperty("textShadowColor")
  })

  it("should use body text size for non-title hero content", () => {
    const { Button } = jest.requireMock("@/src/components/ui")

    renderHero(390)

    expect(screen.getByText("Author").props.className).toContain("text-base")
    expect(screen.getByText("Publisher").props.className).toContain("text-base")
    expect(screen.getByText("Tag").props.className).toContain("text-base")
    expect(
      screen.getByText("bookDetail.readingProgress", {
        includeHiddenElements: true,
      }).props.className,
    ).toContain("text-base")
    for (const progressText of screen.getAllByText("35%", {
      includeHiddenElements: true,
    })) {
      expect(progressText.props.className).toContain("text-base")
    }
    expect(Button).toHaveBeenCalledTimes(2)
    for (const [buttonProps] of Button.mock.calls) {
      expect(buttonProps.textClassName).toBe("text-base")
    }
  })

  it("should render wide hero when available width reaches the breakpoint", () => {
    renderHero(834)

    expect(screen.getByTestId("book-detail-hero-wide")).toBeTruthy()
    expect(screen.queryByTestId("book-detail-hero-narrow")).toBeNull()
  })

  it("should preserve reading action when hero mode changes", () => {
    const { onRead } = renderHero(390)

    fireEvent.press(
      screen.getByRole("button", { name: "bookDetail.startReading" }),
    )

    expect(onRead).toHaveBeenCalledTimes(1)
  })

  it("should normalize reading progress when rendering the progress ring", () => {
    const { CircularProgress } = jest.requireMock("@/src/components/ui")

    renderHero(834)

    expect(CircularProgress).toHaveBeenCalledWith(
      expect.objectContaining({ progress: 0.35 }),
      undefined,
    )
    expect(
      screen.getByRole("progressbar", {
        name: "bookDetail.readingProgress",
      }).props.accessibilityValue,
    ).toMatchObject({ now: 35, text: "35%" })
  })

  it("should preserve format selection when menu action is pressed", () => {
    const { MenuView } = jest.requireMock("@react-native-menu/menu")
    const { onSetFormat } = renderHero(390)
    const menuProps = MenuView.mock.calls.at(-1)?.[0]

    menuProps.onPressAction({ nativeEvent: { event: "PDF" } })

    expect(onSetFormat).toHaveBeenCalledWith("PDF")
  })
})
