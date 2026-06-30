import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native"
import { Image as ExpoImage } from "expo-image"
import * as mockReact from "react"
import {
  Pressable as mockPressable,
  Text as mockText,
  View as mockView,
} from "react-native"

import { showAlertWithStatusBarRestore } from "@/src/constants/alert-with-status-bar"

import SettingsScreen from "./settings-screen"

const mockSetMode = jest.fn()
const mockSetLanguage = jest.fn()
const mockSetHomeCardStyle = jest.fn()

jest.mock("expo-image", () => ({
  Image: {
    clearMemoryCache: jest.fn(() => Promise.resolve(true)),
    clearDiskCache: jest.fn(() => Promise.resolve(true)),
  },
}))

jest.mock("expo-localization", () => ({
  getLocales: jest.fn(() => [{ languageCode: "zh" }]),
}))

jest.mock("expo-router", () => ({
  router: {
    push: jest.fn(),
  },
  useNavigation: jest.fn(() => ({
    addListener: jest.fn(() => jest.fn()),
  })),
}))

jest.mock("@react-native-menu/menu", () => ({
  MenuView: jest.fn(({ children }) => children),
}))

jest.mock("@expo/vector-icons/MaterialIcons", () => jest.fn(() => null))

jest.mock("expo-symbols", () => ({
  SymbolView: jest.fn(() => null),
}))

jest.mock("@/src/constants/alert-with-status-bar", () => ({
  showAlertWithStatusBarRestore: jest.fn(),
}))

jest.mock("@/src/components", () => {
  return {
    ListMenuRow: jest.fn(({ title, value }) =>
      mockReact.createElement(
        mockView,
        null,
        mockReact.createElement(mockText, null, title),
        value ? mockReact.createElement(mockText, null, value) : null,
      ),
    ),
    ListRow: jest.fn(({ detail, onPress, testID, title }) =>
      mockReact.createElement(
        mockPressable,
        { onPress, testID },
        mockReact.createElement(mockText, null, title),
        detail ? mockReact.createElement(mockText, null, detail) : null,
      ),
    ),
    Screen: jest.fn(({ children }) =>
      mockReact.createElement(mockView, null, children),
    ),
    SectionCard: jest.fn(({ children }) =>
      mockReact.createElement(mockView, null, children),
    ),
    SectionLabel: jest.fn(({ children }) =>
      mockReact.createElement(mockText, null, children),
    ),
  }
})

jest.mock("@/src/design/press-feedback", () => ({
  androidRippleColor: jest.fn(() => "transparent"),
  pressedBackgroundColor: jest.fn(() => "transparent"),
}))

jest.mock("@/src/design/tokens", () => ({
  useTheme: jest.fn(() => ({
    colorScheme: "light",
    mode: "system",
    setMode: mockSetMode,
  })),
  useThemePalette: jest.fn(() => ({
    borderStrong: "#ddd",
    surface: "#fff",
    text: "#111",
    textMuted: "#666",
  })),
}))

jest.mock("@/src/i18n", () => ({
  changeLanguage: jest.fn(),
}))

jest.mock("@/src/store/app-store", () => ({
  useAppStore: jest.fn((selector) =>
    selector({
      activeLibraryId: "library-1",
      libraries: [{ id: "library-1", name: "Local Library" }],
      settings: {
        homeCardStyle: "adaptive",
        language: "",
      },
      setHomeCardStyle: mockSetHomeCardStyle,
      setLanguage: mockSetLanguage,
    }),
  ),
}))

jest.mock("react-i18next", () => ({
  initReactI18next: { type: "3rdParty", init: jest.fn() },
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

describe("SettingsScreen developer tools", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("clears Expo Image memory and disk cache from the developer section", async () => {
    render(<SettingsScreen />)

    expect(screen.getByText("settings.developer.title")).toBeTruthy()

    fireEvent.press(screen.getByTestId("settings-clear-image-cache-row"))

    await waitFor(() => {
      expect(ExpoImage.clearMemoryCache).toHaveBeenCalledTimes(1)
      expect(ExpoImage.clearDiskCache).toHaveBeenCalledTimes(1)
      expect(showAlertWithStatusBarRestore).toHaveBeenCalledWith(
        "settings.developer.clearImageCache.doneTitle",
        "settings.developer.clearImageCache.doneDetail",
      )
    })
  })
})
