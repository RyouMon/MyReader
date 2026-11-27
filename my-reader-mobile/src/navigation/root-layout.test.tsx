import AsyncStorage from "@react-native-async-storage/async-storage"
import { dehydrate, QueryClient } from "@tanstack/react-query"
import { act, render, screen, waitFor } from "@testing-library/react-native"
import { StatusBar } from "expo-status-bar"
import type { ReactNode } from "react"
import { Platform } from "react-native"
import { SafeAreaProvider } from "react-native-safe-area-context"

import RootLayout from "@/src/app/_layout"
import { queryClient } from "@/src/services/query/query-client"

const mockReadCatalog = jest.fn(async () => [])
const mockHydrateDataSources = jest.fn(async () => {})
let mockPathname = "/"
const mockStackProps = jest.fn()
const mockScreenProps = jest.fn()

jest.mock("expo-status-bar", () => ({
  StatusBar: jest.fn(() => null),
}))

jest.mock("@/src/global.css", () => ({}))
jest.mock("@/src/polyfills/reader-engine-globals", () => ({}))
jest.mock("@/src/i18n", () => ({
  changeLanguage: async () => {},
  resolveAppLanguage: () => "en",
}))
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(),
  setItem: jest.fn(async () => {}),
  removeItem: jest.fn(async () => {}),
}))
jest.mock("expo-router", () => {
  const React = require("react")
  const { Text } = require("react-native")
  const { useQuery } = require("@tanstack/react-query")
  function CatalogRoute(props: {
    children?: ReactNode
    screenOptions?: unknown
  }) {
    mockStackProps(props.screenOptions)
    const { data } = useQuery({
      queryKey: ["books", "library"],
      queryFn: mockReadCatalog,
    })
    return React.createElement(
      React.Fragment,
      null,
      props.children,
      React.createElement(
        Text,
        null,
        data === undefined
          ? "Loading catalog"
          : data.length === 0
            ? "Empty library"
            : "Deleted book",
      ),
    )
  }
  return {
    Stack: Object.assign(CatalogRoute, {
      Screen: (props: unknown) => {
        mockScreenProps(props)
        return null
      },
    }),
    usePathname: () => mockPathname,
  }
})
jest.mock("expo-router/react-navigation", () => ({
  DarkTheme: { colors: {} },
  DefaultTheme: { colors: {} },
  ThemeProvider: ({ children }: { children: ReactNode }) => children,
}))
jest.mock("react-native-gesture-handler", () => ({
  GestureHandlerRootView: require("react-native").View,
}))
jest.mock("react-native-notifier", () => ({
  NotifierWrapper: ({ children }: { children: ReactNode }) => children,
}))
jest.mock("@/src/components/diagnostics-runtime", () => ({
  DiagnosticsRuntime: () => null,
}))
jest.mock("@/src/components/error-boundary", () => ({
  ErrorBoundary: ({ children }: { children: ReactNode }) => children,
}))
jest.mock("@/src/domain/library/hooks/library-actions", () => ({
  hydrateLibraries: async () => {},
}))
jest.mock("@/src/domain/notifications/download-notifications", () => ({
  initializeDownloadNotifications: () => {},
}))
jest.mock("@/src/domain/sync/components/BookUploadRuntime", () => ({
  BookUploadRuntime: () => null,
}))
jest.mock("@/src/domain/sync/components/SyncRuntime", () => ({
  SyncRuntime: () => null,
}))
jest.mock("@/src/errors/global-handler", () => ({
  setupGlobalErrorHandler: () => {},
}))
jest.mock("@/src/features/reader/reader-open-transition", () => ({
  setReaderTransitionRootNode: () => {},
}))
jest.mock("@/src/features/reader/reader-open-transition-overlay", () => ({
  ReaderOpenTransitionHost: () => null,
}))
jest.mock("@/src/hooks/use-data-source-actions", () => ({
  useDataSourceActions: () => ({ hydrateFromBackend: mockHydrateDataSources }),
}))
jest.mock("@/src/store/app-store", () => ({
  useAppStore: (selector: (state: unknown) => unknown) =>
    selector({
      storeReady: true,
      settings: { themeMode: "light", language: "en" },
    }),
}))

it("waits for disk cache restoration at app startup, then reads the committed catalog", async () => {
  const key = ["books", "library"]
  const previousClient = new QueryClient()
  previousClient.setQueryData(key, [{ id: "1", title: "Deleted book" }])
  const persisted = JSON.stringify({
    buster: "",
    timestamp: Date.now(),
    clientState: dehydrate(previousClient),
  })
  let finishRestore!: (value: string) => void
  jest.mocked(AsyncStorage.getItem).mockReturnValue(
    new Promise((resolve) => {
      finishRestore = resolve
    }),
  )
  const view = render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 400, height: 800 },
        insets: { top: 0, right: 0, bottom: 0, left: 0 },
      }}
    >
      <RootLayout />
    </SafeAreaProvider>,
  )
  try {
    await screen.findByText("Loading catalog")
    expect(AsyncStorage.getItem).toHaveBeenCalledWith("myreader-query-cache")
    expect(mockReadCatalog).not.toHaveBeenCalled()
    await act(async () => finishRestore(persisted))
    await waitFor(() => expect(screen.getByText("Empty library")).toBeTruthy())
    expect(mockReadCatalog).toHaveBeenCalledTimes(1)
    expect(queryClient.getQueryData(key)).toEqual([])
  } finally {
    view.unmount()
    queryClient.clear()
    previousClient.clear()
  }
})

describe("RootLayout status bar ownership", () => {
  const originalPlatform = Platform.OS

  beforeEach(() => {
    jest.clearAllMocks()
    mockPathname = "/"
    jest.mocked(AsyncStorage.getItem).mockResolvedValue(null)
  })

  afterEach(async () => {
    await act(async () => {})
    await queryClient.cancelQueries()
    queryClient.clear()
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: originalPlatform,
    })
  })

  async function withRenderedRootLayout(
    platform: "ios" | "android",
    runAssertions: () => Promise<void>,
  ) {
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: platform,
    })
    const view = render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 400, height: 800 },
          insets: { top: 0, right: 0, bottom: 0, left: 0 },
        }}
      >
        <RootLayout />
      </SafeAreaProvider>,
    )
    try {
      await runAssertions()
    } finally {
      view.unmount()
    }
  }

  it("omits expo-status-bar on iOS and delegates status bar traits to Stack", () =>
    withRenderedRootLayout("ios", async () => {
      await waitFor(() => expect(mockStackProps).toHaveBeenCalled())
      expect(StatusBar).not.toHaveBeenCalled()
      expect(mockStackProps).toHaveBeenCalledWith(
        expect.objectContaining({
          statusBarAnimation: "none",
          statusBarHidden: false,
          statusBarStyle: "dark",
        }),
      )
      expect(mockScreenProps).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "reader",
          options: expect.objectContaining({
            presentation: "fullScreenModal",
            statusBarAnimation: "none",
            statusBarHidden: false,
            statusBarStyle: "dark",
          }),
        }),
      )
    }))

  it("renders expo-status-bar on Android outside the reader route", () =>
    withRenderedRootLayout("android", async () => {
      await waitFor(() => expect(StatusBar).toHaveBeenCalled())
      expect(jest.mocked(StatusBar).mock.calls[0]?.[0]).toEqual({
        style: "dark",
      })
    }))

  it("omits expo-status-bar on Android while on the reader route", () => {
    mockPathname = "/reader/7"
    return withRenderedRootLayout("android", async () => {
      await waitFor(() => expect(mockStackProps).toHaveBeenCalled())
      expect(StatusBar).not.toHaveBeenCalled()
    })
  })
})
