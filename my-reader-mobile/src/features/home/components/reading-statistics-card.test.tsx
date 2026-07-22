import { act, fireEvent, render, screen } from "@testing-library/react-native"

import type { Library } from "@/src/domain/types"
import { useReadingStatistics } from "@/src/domain/reading-statistics/hooks/use-reading-statistics"
import { ReadingStatisticsCard } from "./reading-statistics-card"

jest.mock("@expo/vector-icons", () => ({
  MaterialIcons: jest.fn(() => null),
}))

jest.mock(
  "@/src/domain/reading-statistics/hooks/use-reading-statistics",
  () => ({
    useReadingStatistics: jest.fn(),
  }),
)

jest.mock("@/src/design/tokens", () => ({
  useThemePalette: jest.fn(() => ({
    background: "#fafafa",
    backgroundSecondary: "#eee",
    border: "#ddd",
    borderStrong: "#ccc",
    primary: "#c60",
    surface: "#fff",
    text: "#111",
    textMuted: "#666",
  })),
}))

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { resolvedLanguage: "zh-CN" },
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
  }),
}))

const library = { id: "library-1" } as Library
const year = new Date().getFullYear()
const firstDay = `${year}-01-01`
const secondDay = `${year}-01-02`

function renderStatisticsCard(
  days: Record<string, number>,
  onInspectingChange?: (isInspecting: boolean) => void,
) {
  jest.mocked(useReadingStatistics).mockReturnValue({
    data: {
      days,
      totalDurationSeconds: Object.values(days).reduce(
        (total, duration) => total + duration,
        0,
      ),
      longestStreakDays: Object.keys(days).length,
      completedBooks: 0,
    },
  } as ReturnType<typeof useReadingStatistics>)
  render(
    <ReadingStatisticsCard
      library={library}
      onInspectingChange={onInspectingChange}
    />,
  )
}

describe("ReadingStatisticsCard", () => {
  beforeEach(() => jest.useFakeTimers())

  afterEach(() => {
    jest.clearAllTimers()
    jest.useRealTimers()
  })

  it("should show day feedback when a heatmap day is held for 140 milliseconds", () => {
    renderStatisticsCard({ [firstDay]: 38 * 60 })

    const cell = screen.getByTestId(`reading-statistics-day-${firstDay}`)
    fireEvent(cell, "pressIn", {
      nativeEvent: {
        locationX: 7,
        locationY: 7,
        pageX: 160,
        pageY: 320,
      },
    })
    expect(screen.queryByTestId("reading-statistics-popover")).toBeNull()
    act(() => jest.advanceTimersByTime(139))
    expect(screen.queryByTestId("reading-statistics-popover")).toBeNull()

    act(() => jest.advanceTimersByTime(1))
    expect(screen.getByTestId("reading-statistics-popover")).toBeTruthy()
    expect(screen.getByText(/home\.readingStats\.readingMinutes/)).toBeTruthy()

    fireEvent(cell, "touchEnd")
    expect(screen.queryByText(/home\.readingStats\.readingMinutes/)).toBeNull()
  })

  it("should keep the popover stable when the same cell is pressed at different points", () => {
    renderStatisticsCard({ [firstDay]: 38 * 60 })

    const cell = screen.getByTestId(`reading-statistics-day-${firstDay}`)
    fireEvent(cell, "pressIn", {
      nativeEvent: {
        locationX: 1,
        locationY: 1,
        pageX: 154,
        pageY: 314,
      },
    })
    act(() => jest.advanceTimersByTime(140))
    const firstStyle = screen.getByTestId("reading-statistics-popover").props
      .style as { left: number; top: number }
    const firstPosition = { left: firstStyle.left, top: firstStyle.top }
    fireEvent(cell, "touchEnd")

    fireEvent(cell, "pressIn", {
      nativeEvent: {
        locationX: 13,
        locationY: 13,
        pageX: 166,
        pageY: 326,
      },
    })
    act(() => jest.advanceTimersByTime(140))
    const secondStyle = screen.getByTestId("reading-statistics-popover").props
      .style as { left: number; top: number }

    expect({ left: secondStyle.left, top: secondStyle.top }).toEqual(
      firstPosition,
    )
    fireEvent(cell, "touchEnd")
  })

  it("should lock scrolling when a pressed cell is dragged", () => {
    const onInspectingChange = jest.fn()
    renderStatisticsCard(
      {
        [firstDay]: 38 * 60,
        [secondDay]: 70 * 60,
      },
      onInspectingChange,
    )

    const cell = screen.getByTestId(`reading-statistics-day-${firstDay}`)
    const scrollView = screen.getByTestId("reading-statistics-heatmap-scroll")
    fireEvent(cell, "pressIn", {
      nativeEvent: {
        locationX: 7,
        locationY: 7,
        pageX: 160,
        pageY: 320,
      },
    })

    expect(scrollView.props.scrollEnabled).toBe(true)
    expect(cell.props.onResponderTerminationRequest()).toBe(true)
    act(() => jest.advanceTimersByTime(200))

    expect(
      screen.getByTestId("reading-statistics-heatmap-scroll").props
        .scrollEnabled,
    ).toBe(false)
    expect(onInspectingChange).toHaveBeenLastCalledWith(true)
    expect(
      screen
        .getByTestId(`reading-statistics-day-${firstDay}`)
        .props.onResponderTerminationRequest(),
    ).toBe(false)
    expect(screen.getByText(/"count":38/)).toBeTruthy()

    fireEvent(cell, "responderMove", {
      nativeEvent: { pageX: 160, pageY: 338 },
    })

    expect(screen.getByText(/"count":70/)).toBeTruthy()
    fireEvent(cell, "touchEnd")
    expect(
      screen.getByTestId("reading-statistics-heatmap-scroll").props
        .scrollEnabled,
    ).toBe(true)
    expect(onInspectingChange).toHaveBeenLastCalledWith(false)
    expect(screen.queryByTestId("reading-statistics-popover")).toBeNull()
  })

  it("should allow horizontal scrolling when dragging before inspection activates", () => {
    const onInspectingChange = jest.fn()
    renderStatisticsCard({ [firstDay]: 38 * 60 }, onInspectingChange)

    const cell = screen.getByTestId(`reading-statistics-day-${firstDay}`)
    const scrollView = screen.getByTestId("reading-statistics-heatmap-scroll")
    fireEvent(cell, "pressIn", {
      nativeEvent: {
        locationX: 7,
        locationY: 7,
        pageX: 160,
        pageY: 320,
      },
    })

    expect(screen.queryByTestId("reading-statistics-popover")).toBeNull()
    expect(scrollView.props.scrollEnabled).toBe(true)
    expect(cell.props.onResponderTerminationRequest()).toBe(true)

    fireEvent(scrollView, "scrollBeginDrag")
    act(() => jest.advanceTimersByTime(200))

    expect(screen.queryByTestId("reading-statistics-popover")).toBeNull()
    expect(onInspectingChange).not.toHaveBeenCalledWith(true)
    expect(
      screen.getByTestId("reading-statistics-heatmap-scroll").props
        .scrollEnabled,
    ).toBe(true)
  })
})
