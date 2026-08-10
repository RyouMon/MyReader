import type {
  DataSource,
  DataSourceOnedrive,
  DataSourceWebdav,
} from "@my-reader/tools/types/data-source"
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native"
import { router } from "expo-router"
import type { ComponentType, ReactNode } from "react"
import * as mockReact from "react"
import {
  Platform,
  Pressable as mockPressable,
  Text as mockText,
  View as mockView,
  type ColorValue,
} from "react-native"

import { showAlertWithStatusBarRestore } from "@/src/constants/alert-with-status-bar"

import OneDriveDataSourceDetailScreen from "./onedrive/onedrive-data-source-detail-screen"
import WebDavDataSourceDetailScreen from "./webdav/webdav-data-source-detail-screen"

const mockDeleteDataSource = jest.fn()
const mockReauthenticateOneDriveDataSource = jest.fn()
let mockDataSourceId = ""
let mockDataSources: DataSource[] = []
let mockDeleteAction: { color?: ColorValue; onPress: () => void } | undefined

const mockWebDavSource: DataSourceWebdav = {
  id: "webdav-1",
  type: "webdav",
  name: "WebDAV",
  enabled: true,
  endpoint: "https://dav.example.com",
  username: "reader",
  rootPath: "/Books",
  hasPassword: true,
}

const mockOneDriveSource: DataSourceOnedrive = {
  id: "onedrive-1",
  type: "onedrive",
  name: "OneDrive",
  enabled: true,
  clientId: "client-1",
  displayName: "Reader",
  email: "reader@example.com",
  rootPath: "/Books",
  hasRefreshToken: true,
}

jest.mock("@expo/vector-icons/MaterialIcons", () => ({
  __esModule: true,
  default: jest.fn(() => null),
}))

jest.mock("expo-router", () => ({
  Stack: {
    Screen: jest.fn(() => null),
  },
  router: {
    back: jest.fn(),
    canGoBack: jest.fn(() => true),
    push: jest.fn(),
    replace: jest.fn(),
  },
  useLocalSearchParams: jest.fn(() => ({ dataSourceId: mockDataSourceId })),
}))

jest.mock("expo-symbols", () => ({
  SymbolView: jest.fn(() => null),
}))

jest.mock("react-i18next", () => ({
  initReactI18next: { type: "3rdParty", init: jest.fn() },
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

jest.mock("@/src/components", () => ({
  EmptyState: jest.fn(
    ({
      action,
      detail,
      title,
    }: {
      action?: ReactNode
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
  ),
  ListRow: jest.fn(({ detail, title }: { detail: string; title: string }) =>
    mockReact.createElement(
      mockView,
      null,
      mockReact.createElement(mockText, null, title),
      mockReact.createElement(mockText, null, detail),
    ),
  ),
  Screen: jest.fn(({ children }: { children: ReactNode }) =>
    mockReact.createElement(mockView, null, children),
  ),
  PrimaryButton: jest.fn(
    ({ onPress, title }: { onPress: () => void; title: string }) =>
      mockReact.createElement(
        mockPressable,
        { accessibilityRole: "button", onPress },
        mockReact.createElement(mockText, null, title),
      ),
  ),
  SectionCard: jest.fn(({ children }: { children: ReactNode }) =>
    mockReact.createElement(mockView, null, children),
  ),
}))

jest.mock("@/src/constants/alert-with-status-bar", () => ({
  showAlertWithStatusBarRestore: jest.fn(),
}))

jest.mock("@/src/design/tokens", () => ({
  useThemePalette: jest.fn(() => ({
    background: "#fff",
    border: "#ddd",
    danger: "#b44a3a",
    destructive: "#c00",
    primary: "#c4622d",
    surface: "#fff",
    text: "#111",
    textMuted: "#666",
  })),
}))

jest.mock("@/src/hooks/use-data-source-actions", () => ({
  useDataSourceActions: jest.fn(() => ({
    deleteDataSource: mockDeleteDataSource,
  })),
}))

jest.mock("@/src/features/onedrive/hooks/use-add-onedrive-data-source", () => ({
  useAddOneDriveDataSource: jest.fn(() => ({
    busy: false,
    reauthenticateOneDriveDataSource: mockReauthenticateOneDriveDataSource,
  })),
}))

jest.mock("@/src/navigation/hooks/use-screen-header", () => ({
  useScreenHeader: jest.fn(
    ({ right }: { right?: { label: string; onPress: () => void }[] }) => {
      mockDeleteAction = right?.find((action) =>
        action.label.endsWith("deleteSource"),
      )
      return { options: {}, toolbar: null }
    },
  ),
}))

jest.mock("@/src/store/app-store", () => ({
  useAppStore: jest.fn((selector) =>
    selector({
      dataSources: mockDataSources,
    }),
  ),
}))

jest.mock("@/tw", () => ({
  Text: mockText,
  View: mockView,
}))

const detailCases: {
  DetailScreen: ComponentType
  notFoundTitle: string
  sourceListRoute: "/settings/onedrive" | "/settings/webdav"
  source: DataSource
}[] = [
  {
    DetailScreen: WebDavDataSourceDetailScreen,
    notFoundTitle: "dataSource.notFound.title",
    sourceListRoute: "/settings/webdav",
    source: mockWebDavSource,
  },
  {
    DetailScreen: OneDriveDataSourceDetailScreen,
    notFoundTitle: "dataSource.notFound.title",
    sourceListRoute: "/settings/onedrive",
    source: mockOneDriveSource,
  },
]

describe.each(detailCases)("$source.type data source detail", ({
  DetailScreen,
  notFoundTitle,
  sourceListRoute,
  source,
}) => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockDataSourceId = source.id
    mockDataSources = [source]
    mockDeleteAction = undefined
  })

  it("should pass a serializable danger color to the Android header", () => {
    const initialPlatform = Platform.OS
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: "android",
    })

    try {
      render(<DetailScreen />)

      expect(mockDeleteAction?.color).toBe("#b44a3a")
    } finally {
      Object.defineProperty(Platform, "OS", {
        configurable: true,
        value: initialPlatform,
      })
    }
  })

  it("should preserve details until dismissal when deleting the current data source", async () => {
    let finishRemoval: (() => void) | undefined
    mockDeleteDataSource.mockReturnValue(
      new Promise<void>((resolve) => {
        finishRemoval = resolve
      }),
    )

    const view = render(<DetailScreen />)

    act(() => {
      mockDeleteAction?.onPress()
    })
    const alertButtons = jest.mocked(showAlertWithStatusBarRestore).mock
      .calls[0]?.[2]
    const confirmButton = alertButtons?.find(
      (button) => button.style === "destructive",
    )

    act(() => {
      confirmButton?.onPress?.()
    })

    expect(mockDeleteDataSource).toHaveBeenCalledWith(source.id)

    act(() => {
      mockDataSources = []
      view.rerender(<DetailScreen />)
    })

    expect(router.back).not.toHaveBeenCalled()
    expect(screen.queryByText(notFoundTitle)).toBeNull()
    expect(screen.getAllByText(source.name).length).toBeGreaterThan(0)

    await act(async () => {
      finishRemoval?.()
    })

    await waitFor(() => {
      expect(router.back).toHaveBeenCalledTimes(1)
    })
  })

  it("should return to the source list when the requested source no longer exists", () => {
    mockDataSources = []

    render(<DetailScreen />)

    expect(screen.getByText(notFoundTitle)).toBeTruthy()
    fireEvent.press(
      screen.getByRole("button", { name: "dataSource.backToList" }),
    )
    expect(router.replace).toHaveBeenCalledWith(sourceListRoute)
  })
})
