import { render, screen } from "@testing-library/react-native"

import { getProgressDisplay, ProgressLabel } from "./progress-label"

jest.mock("@/src/design/tokens", () => ({
  useThemePalette: () => ({
    primary: "#b5651d",
    success: "#3A7D5A",
    successSoft: "rgba(58, 125, 90, 0.16)",
    surface: "#faf5ef",
    textMuted: "#7a6b5d",
  }),
}))

jest.mock("react-i18next", () => ({
  initReactI18next: { type: "3rdParty", init: jest.fn() },
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

const t = (key: string) => key

describe("getProgressDisplay", () => {
  test("should prefer explicit label when status label exists", () => {
    expect(getProgressDisplay({ statusLabel: "Queued" }, t)).toEqual({
      text: "Queued",
      isUnread: false,
      isFinished: false,
      isStatusLabel: true,
    })
  })

  test("should show unread label when progress is missing or zero", () => {
    expect(getProgressDisplay(undefined, t)).toMatchObject({
      text: "bookRow.unread",
      isUnread: true,
      isStatusLabel: true,
    })
    expect(getProgressDisplay({ percent: 0 }, t)).toMatchObject({
      text: "bookRow.unread",
      isUnread: true,
      isStatusLabel: true,
    })
  })

  test("should round or finish progress when percent crosses display thresholds", () => {
    expect(getProgressDisplay({ percent: 42.4 }, t)).toMatchObject({
      text: "42%",
      isStatusLabel: false,
    })
    expect(getProgressDisplay({ percent: 99.6 }, t)).toMatchObject({
      text: "bookRow.finished",
      isFinished: true,
      isStatusLabel: true,
    })
  })
})

describe("ProgressLabel", () => {
  test("should render label text when progress display changes", () => {
    const { rerender } = render(<ProgressLabel progress={{ percent: 12 }} />)
    expect(screen.getByText("12%")).toBeTruthy()

    rerender(<ProgressLabel progress={{ percent: 100 }} />)
    expect(screen.getByText("bookRow.finished")).toBeTruthy()

    rerender(<ProgressLabel progress={{ statusLabel: "Syncing" }} />)
    expect(screen.getByText("Syncing")).toBeTruthy()
  })
})
