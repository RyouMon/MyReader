import { type ReactNode } from "react"
import { StyleSheet } from "react-native"
import { act, render, screen } from "@testing-library/react-native"

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

  it("should preserve drag feedback when committing before the reader reaches the target", () => {
    const commonProps = {
      accessibilityLabel: "目录",
      actionPillWidth: 240,
      positionCount: 10,
      palette,
      onOpenToc: jest.fn(),
      onPreviewPosition: (positionIndex: number) => ({
        chapterTitle: "第三章",
        positionLabel: `位置 ${positionIndex + 1} / 10`,
      }),
      onCommitPosition: jest.fn(),
    }
    const { rerender } = render(
      <ReaderTocProgressAction
        {...commonProps}
        currentPositionIndex={0}
        progressPercent={25}
      />,
    )

    act(() => scrubOptions.onPreviewPosition(5))
    const originMarker = screen.getByTestId("reader-progress-origin-marker", {
      includeHiddenElements: true,
    })
    expect(StyleSheet.flatten(originMarker.props.style).left).toBe(60)

    act(() => scrubOptions.onCommitPosition(5))
    expect(
      screen.queryByTestId("reader-progress-origin-marker", {
        includeHiddenElements: true,
      }),
    ).toBeNull()

    rerender(
      <ReaderTocProgressAction
        {...commonProps}
        currentPositionIndex={0}
        progressPercent={25}
      />,
    )
    expect(
      mockUseReaderProgressScrubGesture.mock.calls.at(-1)?.[0].progressPercent,
    ).toBeCloseTo(55.56)

    rerender(
      <ReaderTocProgressAction
        {...commonProps}
        currentPositionIndex={5}
        progressPercent={55.56}
      />,
    )
    expect(
      mockUseReaderProgressScrubGesture.mock.calls.at(-1)?.[0].progressPercent,
    ).toBeCloseTo(55.56)
    expect(screen.queryByText("位置 6 / 10")).toBeNull()
  })
})
