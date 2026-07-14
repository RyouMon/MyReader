import { fireEvent, render } from "@testing-library/react-native"

import { readerChromePalette } from "@/src/design/reader-chrome-palette"
import ReaderActionsExpanded from "./ReaderActionsExpanded"

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

jest.mock("./ReaderChromeIcon", () => ({
  ReaderChromeIcon: () => null,
}))

jest.mock("./ReaderTocProgressAction", () => ({
  ReaderTocProgressAction: ({
    accessibilityLabel,
  }: {
    accessibilityLabel: string
  }) => {
    const { View } = jest.requireActual("react-native")
    return <View accessibilityLabel={accessibilityLabel} />
  },
}))

const palette = readerChromePalette("#2C2420", "#F5EFE9")

const baseProps = {
  insetsBottom: 0,
  visible: true,
  currentPositionIndex: 0,
  positionCount: 10,
  progressPercent: 0,
  readingProgression: "ltr" as const,
  palette,
  onOpenToc: jest.fn(),
  onOpenSettings: jest.fn(),
  onPreviewPosition: jest.fn(() => ({ positionLabel: "1 / 10" })),
  onCommitPosition: jest.fn(),
}

describe("ReaderActionsExpanded", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("should label the navigation action as contents and bookmarks", () => {
    const screen = render(<ReaderActionsExpanded {...baseProps} />)

    expect(screen.getByLabelText("reader.navigation")).toBeTruthy()
  })

  it("should not render a long bookmark action", () => {
    const screen = render(<ReaderActionsExpanded {...baseProps} />)

    expect(screen.queryByLabelText("reader.bookmarks.addCurrent")).toBeNull()
    expect(screen.queryByLabelText("reader.bookmarks.removeCurrent")).toBeNull()
  })

  it("should open settings from the remaining long action", () => {
    const onOpenSettings = jest.fn()
    const screen = render(
      <ReaderActionsExpanded {...baseProps} onOpenSettings={onOpenSettings} />,
    )

    fireEvent.press(screen.getByLabelText("reader.settings"))

    expect(onOpenSettings).toHaveBeenCalledTimes(1)
  })
})
