import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native"
import { router } from "expo-router"
import * as mockReact from "react"
import {
  Pressable as mockPressable,
  Text as mockText,
  View as mockView,
} from "react-native"

import OneDriveAddDataSourceScreen from "./onedrive-add-data-source-screen"

let mockParams: {
  from?: string
  libraryAction?: string
} = {
  from: "add-library",
  libraryAction: "create",
}
const mockAddOneDriveDataSource = jest.fn()

jest.mock("expo-router", () => ({
  Stack: { Screen: jest.fn(() => null) },
  router: {
    back: jest.fn(),
    canGoBack: jest.fn(() => true),
    replace: jest.fn(),
  },
  useLocalSearchParams: () => mockParams,
}))

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

jest.mock("@/src/components", () => ({
  EmptyState: ({
    action,
    detail,
    title,
  }: {
    action?: mockReact.ReactNode
    detail: string
    title: string
  }) =>
    mockReact.createElement(
      mockView,
      null,
      mockReact.createElement(mockText, null, title),
      mockReact.createElement(mockText, null, detail),
      action,
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
}))

jest.mock("@/src/design/tokens", () => ({
  useThemePalette: () => ({
    brandOnedrive: "#0078d4",
    text: "#111",
    textMuted: "#666",
  }),
}))

jest.mock("@/src/features/onedrive/hooks/use-add-onedrive-data-source", () => ({
  useAddOneDriveDataSource: () => ({
    addOneDriveDataSource: mockAddOneDriveDataSource,
    busy: false,
  }),
}))

jest.mock("@/src/features/onedrive/onedrive-adding-empty-state", () => ({
  OneDriveAddingEmptyState: () =>
    mockReact.createElement(mockText, null, "adding"),
}))

jest.mock("@/src/navigation/hooks/use-screen-header", () => ({
  useScreenHeader: () => ({ options: {}, toolbar: null }),
}))

describe("OneDriveAddDataSourceScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockParams = { from: "add-library", libraryAction: "create" }
    mockAddOneDriveDataSource.mockResolvedValue({ id: "onedrive-1" })
  })

  it("shows a sign-in button before starting Microsoft authentication", () => {
    render(<OneDriveAddDataSourceScreen />)

    expect(screen.getByText("onedrive.add.signInTitle")).toBeTruthy()
    expect(
      screen.getByRole("button", {
        name: "onedrive.add.signInWithMicrosoft",
      }),
    ).toBeTruthy()
    expect(mockAddOneDriveDataSource).not.toHaveBeenCalled()
  })

  it("opens the add-library browser only after sign-in completes", async () => {
    render(<OneDriveAddDataSourceScreen />)

    fireEvent.press(
      screen.getByRole("button", {
        name: "onedrive.add.signInWithMicrosoft",
      }),
    )

    await waitFor(() => {
      expect(mockAddOneDriveDataSource).toHaveBeenCalledTimes(1)
      expect(router.replace).toHaveBeenCalledWith({
        pathname: "/settings/add-library/browser",
        params: {
          dataSourceId: "onedrive-1",
          sourceType: "onedrive",
          currentPath: "/",
          libraryAction: "create",
          from: "add-library",
        },
      })
    })
  })
})
