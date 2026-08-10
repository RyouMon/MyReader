import type { DataSourceWebdav } from "@my-reader/tools/types/data-source"
import { act, render, waitFor } from "@testing-library/react-native"
import { router } from "expo-router"
import type { ReactNode } from "react"
import * as mockReact from "react"
import {
  Text as mockText,
  TextInput as mockTextInput,
  View as mockView,
} from "react-native"

import { readWebDavPassword } from "@/src/services/storage/credentials"
import AddWebDavDataSourceScreen from "./add-webdav-data-source-screen"

const mockCreateDataSource = jest.fn()
const mockUpdateDataSource = jest.fn()
const mockTestDataSourceConnection = jest.fn()
let mockSaveAction: { onPress: () => void } | undefined

const mockSource: DataSourceWebdav = {
  id: "webdav-1",
  type: "webdav",
  name: "dav.example.com",
  enabled: true,
  endpoint: "https://dav.example.com:8443/dav",
  username: "reader",
  rootPath: "/Books",
  hasPassword: true,
  createdAt: 123,
}

jest.mock("expo-router", () => ({
  Stack: { Screen: jest.fn(() => null) },
  router: {
    back: jest.fn(),
    canGoBack: jest.fn(() => true),
    replace: jest.fn(),
  },
  useLocalSearchParams: jest.fn(() => ({ dataSourceId: mockSource.id })),
}))

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

jest.mock("@/tw", () => ({
  TextInput: mockTextInput,
  View: mockView,
}))

jest.mock("@/src/components", () => ({
  EmptyState: jest.fn(() => null),
  FormFieldSwitch: jest.fn(() => null),
  FormLabeledFieldRow: jest.fn(
    ({ children, label }: { children: ReactNode; label: string }) =>
      mockReact.createElement(
        mockView,
        null,
        mockReact.createElement(mockText, null, label),
        children,
      ),
  ),
  PrimaryButton: jest.fn(() => null),
  Screen: jest.fn(({ children }: { children: ReactNode }) =>
    mockReact.createElement(mockView, null, children),
  ),
}))

jest.mock("@/src/design/tokens", () => ({
  useThemePalette: () => ({
    background: "#fff",
    border: "#ddd",
    primary: "#c4622d",
    surface: "#fff",
    text: "#111",
    textMuted: "#666",
  }),
}))

jest.mock("@/src/hooks/use-data-source-actions", () => ({
  useDataSourceActions: () => ({
    createDataSource: mockCreateDataSource,
    updateDataSource: mockUpdateDataSource,
    testDataSourceConnection: mockTestDataSourceConnection,
  }),
}))

jest.mock("@/src/navigation/hooks/use-screen-header", () => ({
  useScreenHeader: ({ right }: { right?: { onPress: () => void }[] }) => {
    mockSaveAction = right?.[0]
    return { options: {}, toolbar: null }
  },
}))

jest.mock("@/src/services/storage/credentials", () => ({
  readWebDavPassword: jest.fn(),
}))

jest.mock("@/src/store/app-store", () => ({
  useAppStore: (selector: (state: object) => unknown) =>
    selector({ dataSources: [mockSource] }),
}))

describe("AddWebDavDataSourceScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSaveAction = undefined
    jest.mocked(readWebDavPassword).mockResolvedValue("saved-password")
    mockTestDataSourceConnection.mockResolvedValue({ ok: true, message: "OK" })
    mockUpdateDataSource.mockResolvedValue(undefined)
  })

  it("should update the existing source and preserve its saved password", async () => {
    render(<AddWebDavDataSourceScreen />)

    act(() => mockSaveAction?.onPress())

    await waitFor(() => {
      expect(mockUpdateDataSource).toHaveBeenCalledWith(
        expect.objectContaining({
          id: mockSource.id,
          endpoint: mockSource.endpoint,
          rootPath: mockSource.rootPath,
          username: mockSource.username,
          createdAt: mockSource.createdAt,
        }),
        { type: "webdav", password: "saved-password" },
      )
    })
    expect(mockCreateDataSource).not.toHaveBeenCalled()
    expect(mockTestDataSourceConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        id: mockSource.id,
        endpoint: mockSource.endpoint,
      }),
      { type: "webdav", password: "saved-password" },
    )
    expect(router.back).toHaveBeenCalledTimes(1)
  })
})
