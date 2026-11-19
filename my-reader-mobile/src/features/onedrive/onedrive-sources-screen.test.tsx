import { fireEvent, render, screen } from "@testing-library/react-native"
import { router } from "expo-router"
import * as mockReact from "react"
import {
  Pressable as mockPressable,
  Text as mockText,
  View as mockView,
} from "react-native"

import OneDriveSourcesScreen from "./onedrive-sources-screen"

let mockDataSources: unknown[] = []

jest.mock("expo-router", () => ({
  Stack: { Screen: jest.fn(() => null) },
  router: {
    push: jest.fn(),
  },
}))

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

jest.mock("@/src/components", () => ({
  EmptyState: ({
    action,
    title,
  }: {
    action?: mockReact.ReactNode
    title: string
  }) =>
    mockReact.createElement(
      mockView,
      null,
      mockReact.createElement(mockText, null, title),
      action,
    ),
  ListRow: ({
    detail,
    onPress,
    testID,
    title,
  }: {
    detail?: string
    onPress?: () => void
    testID?: string
    title: string
  }) =>
    mockReact.createElement(
      mockPressable,
      { onPress, testID },
      mockReact.createElement(mockText, null, title),
      detail ? mockReact.createElement(mockText, null, detail) : null,
    ),
  PrimaryButton: ({
    onPress,
    title,
  }: {
    onPress?: () => void
    title: string
  }) =>
    mockReact.createElement(
      mockPressable,
      { accessibilityRole: "button", onPress },
      mockReact.createElement(mockText, null, title),
    ),
  Screen: ({ children }: { children: mockReact.ReactNode }) =>
    mockReact.createElement(mockView, null, children),
  SectionCard: ({ children }: { children: mockReact.ReactNode }) =>
    mockReact.createElement(mockView, null, children),
}))

jest.mock("@/src/components/ui/entity-list-row-icons", () => ({
  ENTITY_LIST_ROW_ICONS: {
    onedriveDataSource: {},
  },
}))

jest.mock("@/src/design/tokens", () => ({
  useThemePalette: () => ({ primary: "#c4622d", background: "#fff" }),
}))

jest.mock("@/src/navigation/hooks/use-screen-header", () => ({
  useScreenHeader: (options: unknown) => ({ options, toolbar: null }),
}))

jest.mock("@/src/navigation/toolbar-action-helpers", () => ({
  createAddAction: (action: unknown) => action,
}))

jest.mock("@/src/store/app-store", () => ({
  useAppStore: (selector: (state: { dataSources: unknown[] }) => unknown) =>
    selector({ dataSources: mockDataSources }),
}))

describe("OneDriveSourcesScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockDataSources = []
  })

  it("opens the intermediate sign-in screen when adding a source", () => {
    render(<OneDriveSourcesScreen />)

    fireEvent.press(screen.getByRole("button", { name: "onedrive.addSource" }))

    expect(router.push).toHaveBeenCalledWith("/settings/onedrive/add")
  })
})
