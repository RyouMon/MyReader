import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native"
import { Image as ExpoImage } from "expo-image"
import { router } from "expo-router"
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
const mockSetDiagnosticsEnabled = jest.fn()
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

jest.mock("@/src/config/diagnostics", () => ({
  DIAGNOSTICS_AVAILABLE: true,
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
    ListRow: jest.fn(
      ({ accessory, detail, label, onPress, testID, title, value }) =>
        mockReact.createElement(
          mockPressable,
          { accessibilityLabel: label, onPress, testID },
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
  resolveAppLanguage: jest.fn((language: string) =>
    language.startsWith("en") ? "en" : "zh-CN",
  ),
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
        diagnosticsEnabled: false,
        homeCardStyle: "adaptive",
        language: "",
        libraryPerformanceProfilerEnabled: false,
      },
      setCoverLoadingSkeletonPulseEnabled:
        mockSetCoverLoadingSkeletonPulseEnabled,
      setDiagnosticsEnabled: mockSetDiagnosticsEnabled,
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
    t: (key: string, options?: { name?: string }) =>
      key === "settings.manageLibrary"
        ? `manage-library:${options?.name}`
        : key,
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

describe("SettingsScreen privacy", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("should enable diagnostic sharing only when the user changes the switch", () => {
    render(<SettingsScreen />)

    fireEvent(
      screen.getByTestId("settings-diagnostics-switch"),
      "valueChange",
      true,
    )

    expect(mockSetDiagnosticsEnabled).toHaveBeenCalledWith(true)
  })
})

describe("SettingsScreen library navigation", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("should open library details when a library row is pressed", () => {
    render(<SettingsScreen />)

    expect(
      screen.getByLabelText(
        "manage-library:Remote Library, libraryDetail.calibreLibrary",
      ),
    ).toBeTruthy()
    fireEvent.press(screen.getByTestId("settings-library-row-library-2"))

    expect(router.push).toHaveBeenCalledWith({
      pathname: "/settings/library/[libraryId]",
      params: { libraryId: "library-2" },
    })
  })

  it("should show semantic icons for every settings row", () => {
    render(<SettingsScreen />)

    const components = jest.requireMock("@/src/components") as {
      ListMenuRow: jest.Mock
      ListRow: jest.Mock
    }
    const rowProps = [
      ...components.ListRow.mock.calls.map(([props]) => props),
      ...components.ListMenuRow.mock.calls.map(([props]) => props),
    ]

    expect(rowProps.length).toBeGreaterThan(0)
    for (const row of rowProps) {
      expect(row.icon).toBeDefined()
    }
  })

  it("should keep the add-library row separate from the library list", () => {
    render(<SettingsScreen />)

    const { SectionCard } = jest.requireMock("@/src/components") as {
      SectionCard: jest.Mock
    }
    const sectionChildren = SectionCard.mock.calls.map(
      ([props]) => props.children,
    )
    const libraryRows = mockReact.Children.toArray(sectionChildren[0])
    const addLibraryRows = mockReact.Children.toArray(sectionChildren[1])

    expect(
      libraryRows.map(
        (child) =>
          (child as mockReact.ReactElement<{ testID?: string }>).props.testID,
      ),
    ).toEqual([
      "settings-library-row-library-1",
      "settings-library-row-library-2",
    ])
    expect(
      addLibraryRows.map(
        (child) =>
          (child as mockReact.ReactElement<{ testID?: string }>).props.testID,
      ),
    ).toEqual(["settings-add-library-row"])
  })
})
