import { act, render, screen } from "@testing-library/react-native"
import type { ReactNode } from "react"
import { StyleSheet } from "react-native"

import type { ReaderChromePalette } from "@/src/design/reader-chrome-palette"

import { ReaderTocProgressAction } from "./ReaderTocProgressAction"
import { useReaderProgressScrubGesture } from "./useReaderProgressScrubGesture"

jest.mock("react-native-gesture-handler", () => ({
  GestureDetector: ({ children }: { children: ReactNode }) => children,
}))

jest.mock("./ReaderChromeIcon", () => ({
  ReaderChromeIcon: () => null,
}))

jest.mock("./useReaderProgressScrubGesture", () => ({
  useReaderProgressScrubGesture: jest.fn(),
}))

const palette: ReaderChromePalette = {
  accent: "#C4622D",
  accentText: "#C4622D",
  actionSurface: "#FFFFFF",
  actionText: "#1C1714",
  bg: "#F7F3EC",
  border: "#D8CEC2",
  handle: "#8B8177",
  progressFill: "#8B4A2C",
  progressText: "#FFFFFF",
  segmentActive: "#F2E2D5",
  segmentIdle: "#EEE8DF",
  sheetSurface: "#F7F3EC",
  sliderTrack: "#D8CEC2",
  stepperBtn: "#E9DED2",
  text: "#1C1714",
  textFaint: "#A79A8E",
  textMuted: "#5C5349",
  tocRowActive: "#F2E2D5",
  tocRowIdle: "#EEE8DF",
}

const mockUseReaderProgressScrubGesture = jest.mocked(
  useReaderProgressScrubGesture,
)
type ScrubOptions = Parameters<typeof useReaderProgressScrubGesture>[0]

describe("ReaderTocProgressAction", () => {
  let scrubOptions: ScrubOptions

  beforeEach(() => {
    mockUseReaderProgressScrubGesture.mockImplementation((options) => {
      scrubOptions = options
      return {
        gesture: {},
        pressFeedbackStyle: {},
        progressFillStyle: {},
      } as ReturnType<typeof useReaderProgressScrubGesture>
    })
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it("should show one-third progress when the reader is on page one of three", () => {
    render(
      <ReaderTocProgressAction
        accessibilityLabel="目录"
        actionPillWidth={240}
        readingProgression="ltr"
        currentPositionIndex={0}
        positionCount={3}
        palette={palette}
        onOpenToc={jest.fn()}
        onPreviewPosition={(positionIndex) => ({
          positionLabel: `位置 ${positionIndex + 1} / 3`,
        })}
        onCommitPosition={jest.fn()}
      />,
    )

    expect(scrubOptions.progressPercent).toBeCloseTo(33.33)
  })

  it("should preserve drag feedback when committing before the reader reaches the target", () => {
    jest.useFakeTimers()
    const commonProps = {
      accessibilityLabel: "目录",
      actionPillWidth: 240,
      readingProgression: "ltr" as const,
      positionCount: 3,
      palette,
      onOpenToc: jest.fn(),
      onPreviewPosition: (positionIndex: number) => ({
        chapterTitle: "第三章",
        positionLabel: `位置 ${positionIndex + 1} / 3`,
      }),
      onCommitPosition: jest.fn(),
    }
    const { rerender } = render(
      <ReaderTocProgressAction {...commonProps} currentPositionIndex={1} />,
    )

    act(() => scrubOptions.onPreviewPosition(2))
    const originMarker = screen.getByTestId("reader-progress-origin-marker", {
      includeHiddenElements: true,
    })
    expect(StyleSheet.flatten(originMarker.props.style).left).toBeCloseTo(160)

    act(() => scrubOptions.onCommitPosition(2))
    expect(
      screen.queryByTestId("reader-progress-origin-marker", {
        includeHiddenElements: true,
      }),
    ).toBeNull()

    rerender(
      <ReaderTocProgressAction {...commonProps} currentPositionIndex={1} />,
    )
    expect(
      mockUseReaderProgressScrubGesture.mock.calls.at(-1)?.[0].progressPercent,
    ).toBe(100)

    rerender(
      <ReaderTocProgressAction {...commonProps} currentPositionIndex={2} />,
    )
    expect(
      mockUseReaderProgressScrubGesture.mock.calls.at(-1)?.[0].progressPercent,
    ).toBe(100)
    expect(screen.queryByText("位置 3 / 3")).toBeNull()
    act(() => jest.runOnlyPendingTimers())
  })

  it("should anchor progress feedback to the right when reading right to left", () => {
    render(
      <ReaderTocProgressAction
        accessibilityLabel="目录"
        actionPillWidth={240}
        readingProgression="rtl"
        currentPositionIndex={1}
        positionCount={3}
        palette={palette}
        onOpenToc={jest.fn()}
        onPreviewPosition={(positionIndex) => ({
          positionLabel: `位置 ${positionIndex + 1} / 3`,
        })}
        onCommitPosition={jest.fn()}
      />,
    )

    act(() => scrubOptions.onPreviewPosition(2))

    expect(scrubOptions.direction).toBe("rtl")
    const originMarker = screen.getByTestId("reader-progress-origin-marker", {
      includeHiddenElements: true,
    })
    expect(StyleSheet.flatten(originMarker.props.style).left).toBeCloseTo(80)
  })
})
