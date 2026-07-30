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
import { clearBookCoverThumbnailCache } from "@/src/services/core/content"
import { clearCoverThumbnailCache } from "@/src/services/fs/cover-thumbnail-cache"

import SettingsScreen from "./settings-screen"

const mockSetMode = jest.fn()
const mockSetLanguage = jest.fn()
const mockSetHomeCardStyle = jest.fn()
const mockSetLibraryPerformanceProfilerEnabled = jest.fn()
const mockSetCoverLoadingSkeletonPulseEnabled = jest.fn()
const mockSetCoverThumbnailGenerationConcurrency = jest.fn()

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

jest.mock("./components/developer-concurrency-control", () => ({
  DeveloperConcurrencyControl: jest.fn(
    ({
      testID,
      onValueChange,
      value,
    }: {
      testID: string
      onValueChange: (value: number) => void
      value: number
    }) =>
      mockReact.createElement(
        mockView,
        {
          onValueChange,
          testID,
          value,
        } as Record<string, unknown>,
        mockReact.createElement(mockText, null, String(value)),
      ),
  ),
}))

jest.mock("expo-symbols", () => ({
  SymbolView: jest.fn(() => null),
}))

jest.mock("@/src/constants/alert-with-status-bar", () => ({
  showAlertWithStatusBarRestore: jest.fn(),
}))

jest.mock("@/src/services/core/content", () => ({
  clearBookCoverThumbnailCache: jest.fn(() => Promise.resolve()),
}))

jest.mock("@/src/services/fs/cover-thumbnail-cache", () => ({
  clearCoverThumbnailCache: jest.fn(),
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
    ListRow: jest.fn(({ accessory, detail, onPress, testID, title, value }) =>
      mockReact.createElement(
        mockPressable,
        { onPress, testID },
        mockReact.createElement(mockText, null, title),
        detail ? mockReact.createElement(mockText, null, detail) : null,
        value ? mockReact.createElement(mockText, null, value) : null,
        accessory ?? null,
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
    backgroundSecondary: "#f5f0e8",
    border: "#ddd",
    borderStrong: "#ddd",
    primary: "#c4622d",
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
      libraries: [
        { id: "library-1", name: "Local Library" },
        { id: "library-2", name: "Remote Library" },
      ],
      settings: {
        coverLoadingSkeletonPulseEnabled: true,
        coverThumbnailGenerationConcurrency: 4,
        homeCardStyle: "adaptive",
        language: "",
        libraryPerformanceProfilerEnabled: false,
      },
      setCoverLoadingSkeletonPulseEnabled:
        mockSetCoverLoadingSkeletonPulseEnabled,
      setCoverThumbnailGenerationConcurrency:
        mockSetCoverThumbnailGenerationConcurrency,
      setHomeCardStyle: mockSetHomeCardStyle,
      setLanguage: mockSetLanguage,
      setLibraryPerformanceProfilerEnabled:
        mockSetLibraryPerformanceProfilerEnabled,
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

  it("should clear image and thumbnail caches from the developer section when using developer settings", async () => {
    render(<SettingsScreen />)

    expect(screen.getByText("settings.developer.title")).toBeTruthy()

    fireEvent.press(screen.getByTestId("settings-clear-image-cache-row"))

    await waitFor(() => {
      expect(ExpoImage.clearMemoryCache).toHaveBeenCalledTimes(1)
      expect(ExpoImage.clearDiskCache).toHaveBeenCalledTimes(1)
      expect(clearCoverThumbnailCache).toHaveBeenCalledTimes(1)
      expect(clearBookCoverThumbnailCache).toHaveBeenCalledTimes(2)
      expect(clearBookCoverThumbnailCache).toHaveBeenNthCalledWith(1, {
        id: "library-1",
        name: "Local Library",
      })
      expect(clearBookCoverThumbnailCache).toHaveBeenNthCalledWith(2, {
        id: "library-2",
        name: "Remote Library",
      })
      expect(showAlertWithStatusBarRestore).toHaveBeenCalledWith(
        "settings.developer.clearImageCache.doneTitle",
        "settings.developer.clearImageCache.doneDetail",
      )
    })
  })

  it("should toggle the library performance profiler from the developer section when using developer settings", () => {
    render(<SettingsScreen />)

    expect(screen.queryByText("settings.developer.disabled")).toBeNull()

    fireEvent(
      screen.getByTestId("settings-library-performance-profiler-switch"),
      "valueChange",
      true,
    )

    expect(mockSetLibraryPerformanceProfilerEnabled).toHaveBeenCalledWith(true)
  })

  it("should toggle the cover loading animation from the developer section when using developer settings", () => {
    render(<SettingsScreen />)

    fireEvent(
      screen.getByTestId("settings-cover-loading-animation-switch"),
      "valueChange",
      false,
    )

    expect(mockSetCoverLoadingSkeletonPulseEnabled).toHaveBeenCalledWith(false)
  })

  it("should change cover thumbnail concurrency from the developer stepper when using developer settings", () => {
    render(<SettingsScreen />)

    fireEvent(
      screen.getByTestId("settings-cover-thumbnail-concurrency-stepper"),
      "valueChange",
      6,
    )

    expect(mockSetCoverThumbnailGenerationConcurrency).toHaveBeenCalledWith(6)
  })
})
