import type { DataSource } from "@my-reader/tools/types/data-source"
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native"
import { router } from "expo-router"
import type { ReactNode } from "react"
import {
  showAlertWithStatusBarRestore,
  showErrorAlert,
} from "@/src/constants/alert-with-status-bar"
import { DataSourceInUseError } from "@/src/errors"
import { CloudAddDataSourceScreen } from "./cloud-add-data-source-screen"
import { CloudDataSourceDetailScreen } from "./cloud-data-source-detail-screen"
import { CloudSourcesScreen } from "./cloud-sources-screen"
import { RemoteDirectoryBrowserScreen } from "../settings/components/remote-directory-browser-screen"

let mockParams: Record<string, string> = {}
let mockSources: DataSource[] = []
let mockHeader: { right?: { label: string; onPress: () => void }[] } = {}
const mockCreate = jest.fn()
const mockUpdate = jest.fn()
const mockDelete = jest.fn()
const mockTestConnection = jest.fn()
const mockAuthenticate = jest.fn()
const mockReauthenticate = jest.fn()
const mockReadCredentials = jest.fn()
const mockRetry = jest.fn()
const mockCreateDirectory = jest.fn()
let mockBrowser = { notFound: false, resolveFailed: false }

jest.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  router: {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: jest.fn(() => true),
  },
  useLocalSearchParams: () => mockParams,
}))
jest.mock("react-i18next", () => ({
  ...jest.requireActual("react-i18next"),
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}))
jest.mock("@/src/components", () => {
  const React = require("react")
  const { View, Text, TextInput, Pressable, Switch } = require("react-native")
  const Container = ({ children }: { children: ReactNode }) =>
    React.createElement(View, null, children)
  const Button = ({ title, ...props }: { title: string }) =>
    React.createElement(
      Pressable,
      { accessibilityRole: "button", ...props },
      React.createElement(Text, null, title),
    )
  return {
    Screen: Container,
    SectionCard: Container,
    EmptyState: ({
      title,
      detail,
      action,
    }: {
      title: string
      detail: string
      action: ReactNode
    }) =>
      React.createElement(
        View,
        null,
        React.createElement(Text, null, title),
        React.createElement(Text, null, detail),
        action,
      ),
    FormTextField: ({ label, ...props }: { label: string }) =>
      React.createElement(TextInput, { accessibilityLabel: label, ...props }),
    FormSwitch: ({ label, ...props }: { label: string }) =>
      React.createElement(Switch, { accessibilityLabel: label, ...props }),
    PrimaryButton: Button,
    Button,
    IconButton: ({ label, ...props }: { label: string }) =>
      React.createElement(Button, { title: label, ...props }),
    ListRow: ({
      title,
      detail,
      onPress,
    }: {
      title: string
      detail: string
      onPress?: () => void
    }) =>
      React.createElement(
        Pressable,
        { onPress },
        React.createElement(Text, null, title),
        React.createElement(Text, null, detail),
      ),
  }
})
jest.mock("@/tw", () => jest.requireActual("react-native"))
jest.mock("@/src/design/tokens", () => ({ useThemePalette: () => ({}) }))
jest.mock("@/src/components/ui/provider-icons", () => ({
  GoogleDriveIcon: () => null,
  DropboxIcon: () => null,
  S3StorageIcon: () => null,
}))
jest.mock("@/src/navigation/hooks/use-screen-header", () => ({
  useScreenHeader: (props: typeof mockHeader) => {
    mockHeader = props
    return { options: {}, toolbar: null }
  },
}))
jest.mock("@/src/store/app-store", () => ({
  useAppStore: (selector: (state: object) => unknown) =>
    selector({ dataSources: mockSources }),
}))
jest.mock("@/src/hooks/use-data-source-actions", () => ({
  useDataSourceActions: () => ({
    createDataSource: mockCreate,
    updateDataSource: mockUpdate,
    deleteDataSource: mockDelete,
    testDataSourceConnection: mockTestConnection,
  }),
}))
jest.mock("./hooks/use-cloud-data-source", () => ({
  useCloudDataSource: () => ({
    authenticate: mockAuthenticate,
    reauthenticate: mockReauthenticate,
    busy: false,
  }),
}))
jest.mock("@/src/services/storage/credentials", () => ({
  readS3Credentials: (...args: unknown[]) => mockReadCredentials(...args),
}))
jest.mock("@/src/constants/alert-with-status-bar", () => ({
  showErrorAlert: jest.fn(),
  showAlertWithStatusBarRestore: jest.fn(),
}))
jest.mock("@/src/components/error-boundary", () => ({
  ErrorBoundary: ({ children }: { children: ReactNode }) => children,
}))
jest.mock("@/src/domain/library/hooks/library-actions", () => ({
  switchActiveLibrary: jest.fn(),
}))
jest.mock("@/src/domain/notifications/library-notifications", () => ({
  promptLibraryAddedAfterNavigation: jest.fn(),
}))
jest.mock("@/src/features/onedrive/hooks/use-add-onedrive-data-source", () => ({
  useAddOneDriveDataSource: () => ({
    busy: false,
    reauthenticateOneDriveDataSource: jest.fn(),
  }),
}))
jest.mock("@/src/features/settings/add-library-flow-context", () => ({
  useAddLibraryFlow: () => ({ finishAddingLibrary: jest.fn() }),
}))
jest.mock("@/src/features/settings/hooks/use-remote-directory-browser", () => ({
  useRemoteDirectoryBrowser: () => ({
    ...mockBrowser,
    candidate: mockSources[0],
    candidateId: mockSources[0]?.id,
    entries: [{ name: "Existing", path: "/Existing" }],
    loading: false,
    error: null,
    saving: false,
    creating: false,
    canCreateDirectory: true,
    creationError: null,
    clearCreationError: jest.fn(),
    createDirectory: mockCreateDirectory,
    currentPath: "/",
    retry: mockRetry,
    choosePath: jest.fn(),
  }),
}))

const oauthSource = (type: "gdrive" | "dropbox"): DataSource => ({
  id: `${type}-1`,
  type,
  name: "Reader",
  enabled: true,
  clientId: "configured-client",
  accountId: "account-1",
  displayName: "Reader",
  email: "reader@example.com",
  rootPath: "/Books",
  hasRefreshToken: true,
})
const s3Source: DataSource = {
  id: "s3-1",
  type: "s3",
  name: "Archive",
  enabled: true,
  endpoint: "https://s3.example.com",
  bucket: "books",
  region: "us-east-1",
  rootPath: "/Library",
  virtualHostStyle: true,
  hasCredentials: true,
}
const secrets = {
  accessKeyId: "key",
  secretAccessKey: " secret ",
  sessionToken: "temporary",
}

async function headerAction(label: string) {
  const action = mockHeader.right?.find(
    (candidate) => candidate.label === label,
  )
  expect(action).toBeDefined()
  await act(async () => action?.onPress())
}
function fillS3() {
  for (const [field, value] of Object.entries({
    endpoint: " https://s3.example.com ",
    bucket: " books ",
    region: " us-east-1 ",
    accessKey: " key ",
    secretKey: " secret ",
    sessionToken: " temporary ",
    rootPath: " /Library ",
  })) {
    fireEvent.changeText(
      screen.getByLabelText(`cloud.form.${field}Label`),
      value,
    )
  }
}

describe("cloud source screens", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockParams = {}
    mockSources = []
    mockHeader = {}
    mockBrowser = { notFound: false, resolveFailed: false }
    mockCreateDirectory.mockResolvedValue({
      name: "Created",
      path: "/Created",
      isDirectory: true,
    })
    jest.mocked(router.canGoBack).mockReturnValue(true)
    mockCreate.mockImplementation(async (source: DataSource) => ({
      ...source,
      id: "created",
    }))
    mockUpdate.mockResolvedValue(undefined)
    mockDelete.mockResolvedValue(undefined)
    mockTestConnection.mockResolvedValue({ ok: true, message: "OK" })
    mockReadCredentials.mockResolvedValue(secrets)
    mockReauthenticate.mockResolvedValue(true)
    mockAuthenticate.mockImplementation(
      async (provider: "gdrive" | "dropbox") => ({
        source: oauthSource(provider),
        accessToken: "access",
        refreshToken: "refresh",
        expiresAt: 123,
        googleAccount: "reader@example.com",
      }),
    )
  })

  it.each([
    "gdrive",
    "dropbox",
  ] as const)("requires an explicit %s sign-in and tests access before saving", async (provider) => {
    mockParams = { from: "add-library", libraryAction: "create" }
    render(<CloudAddDataSourceScreen provider={provider} />)
    expect(mockAuthenticate).not.toHaveBeenCalled()
    expect(screen.queryByLabelText(/client|app.?key/i)).toBeNull()
    fireEvent.changeText(
      screen.getByLabelText("cloud.form.rootPathLabel"),
      " /New Books ",
    )
    fireEvent.press(screen.getByText("cloud.form.signIn"))
    await waitFor(() => expect(mockCreate).toHaveBeenCalled())
    const credential = {
      type: provider,
      accessToken: "access",
      refreshToken: "refresh",
      accessTokenExpiresAt: 123,
      googleAccount: "reader@example.com",
    }
    expect(mockTestConnection).toHaveBeenCalledWith(
      expect.objectContaining({ type: provider, rootPath: "/New Books" }),
      credential,
    )
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ type: provider, rootPath: "/New Books" }),
      credential,
    )
    expect(router.replace).toHaveBeenCalledWith({
      pathname: "/settings/add-library/browser",
      params: {
        dataSourceId: "created",
        sourceType: provider,
        currentPath: "/",
        libraryAction: "create",
        from: "add-library",
      },
    })
  })

  it.each([
    "gdrive",
    "dropbox",
  ] as const)("keeps an edited %s source and returns to its previous directory", async (provider) => {
    mockSources = [oauthSource(provider)]
    mockParams = {
      dataSourceId: `${provider}-1`,
      returnToBrowser: "true",
      returnPath: "/Nested",
    }
    render(<CloudAddDataSourceScreen provider={provider} />)
    fireEvent.changeText(
      screen.getByLabelText("cloud.form.rootPathLabel"),
      " /Updated ",
    )
    fireEvent.press(screen.getByText("cloud.form.reauthenticate"))
    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ id: `${provider}-1`, rootPath: "/Updated" }),
      ),
    )
    expect(mockCreate).not.toHaveBeenCalled()
    expect(mockReauthenticate).toHaveBeenCalledWith(mockSources[0])
    expect(router.replace).toHaveBeenCalledWith({
      pathname: `/settings/${provider}/browser`,
      params: {
        dataSourceId: `${provider}-1`,
        sourceType: provider,
        currentPath: "/Nested",
        libraryAction: "open",
      },
    })
  })

  it("keeps a cancelled login on the form without saving", async () => {
    mockAuthenticate.mockResolvedValue(null)
    render(<CloudAddDataSourceScreen provider="gdrive" />)
    await headerAction("cloud.form.save")
    expect(mockCreate).not.toHaveBeenCalled()
    expect(router.back).not.toHaveBeenCalled()
  })

  it("blocks persistence when provider access fails and permits retry", async () => {
    mockTestConnection.mockResolvedValueOnce({ ok: false, message: "denied" })
    render(<CloudAddDataSourceScreen provider="dropbox" />)
    await headerAction("cloud.form.save")
    expect(showErrorAlert).toHaveBeenCalledWith(
      "cloud.form.connectionFailed",
      expect.stringContaining("denied"),
    )
    expect(mockCreate).not.toHaveBeenCalled()
    await headerAction("cloud.form.save")
    expect(mockCreate).toHaveBeenCalledTimes(1)
    expect(router.back).toHaveBeenCalledTimes(1)
  })

  it("surfaces persistence errors without leaving the form", async () => {
    mockCreate.mockRejectedValueOnce(new Error("disk full"))
    render(<CloudAddDataSourceScreen provider="gdrive" />)
    await headerAction("cloud.form.save")
    expect(showErrorAlert).toHaveBeenCalledWith(
      "cloud.form.addFailed",
      expect.stringContaining("disk full"),
    )
    expect(router.back).not.toHaveBeenCalled()
  })

  it("validates S3 required fields and keeps secrets out of the persisted source", async () => {
    jest.mocked(router.canGoBack).mockReturnValue(false)
    render(<CloudAddDataSourceScreen provider="s3" />)
    await headerAction("cloud.form.save")
    expect(screen.getByText("cloud.form.endpointRequired")).toBeTruthy()
    expect(mockTestConnection).not.toHaveBeenCalled()
    fillS3()
    fireEvent.changeText(
      screen.getByLabelText("cloud.form.nameLabel"),
      " Archive ",
    )
    fireEvent(
      screen.getByLabelText("cloud.form.virtualHostStyle"),
      "valueChange",
      true,
    )
    await headerAction("cloud.form.save")
    expect(mockCreate).toHaveBeenCalledWith(
      { ...s3Source, id: "" },
      { type: "s3", ...secrets },
    )
    expect(router.replace).toHaveBeenCalledWith("/settings/s3")
  })

  it("loads saved S3 credentials before editing and preserves secret whitespace", async () => {
    mockSources = [s3Source]
    mockParams = { dataSourceId: s3Source.id }
    render(<CloudAddDataSourceScreen provider="s3" />)
    await waitFor(() =>
      expect(
        screen.getByLabelText("cloud.form.accessKeyLabel").props.value,
      ).toBe("key"),
    )
    fireEvent.changeText(
      screen.getByLabelText("cloud.form.bucketLabel"),
      "archive",
    )
    await headerAction("cloud.form.save")
    expect(mockReadCredentials).toHaveBeenCalledWith(s3Source.id)
    expect(mockUpdate).toHaveBeenCalledWith(
      { ...s3Source, bucket: "archive" },
      { type: "s3", ...secrets },
    )
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it.each([
    "connection",
    "save",
  ])("reports S3 %s failures without navigating away", async (failure) => {
    if (failure === "connection")
      mockTestConnection.mockResolvedValueOnce({ ok: false, message: "denied" })
    else mockCreate.mockRejectedValueOnce(new Error("disk full"))
    render(<CloudAddDataSourceScreen provider="s3" />)
    fillS3()
    await headerAction("cloud.form.save")
    expect(showErrorAlert).toHaveBeenCalled()
    expect(router.back).not.toHaveBeenCalled()
  })

  it("does not turn a missing edit target into a new source", () => {
    mockParams = { dataSourceId: "removed" }
    render(<CloudAddDataSourceScreen provider="s3" />)
    expect(screen.getByText("dataSource.notFound.title")).toBeTruthy()
    expect(mockHeader.right).toEqual([])
    fireEvent.press(screen.getByText("dataSource.backToList"))
    expect(router.replace).toHaveBeenCalledWith("/settings/s3")
  })

  it.each([
    "gdrive",
    "dropbox",
    "s3",
  ] as const)("shows only %s accounts and routes to their details", (provider) => {
    mockSources = [oauthSource("gdrive"), oauthSource("dropbox"), s3Source]
    render(<CloudSourcesScreen provider={provider} />)
    const label = provider === "s3" ? "Archive" : "Reader"
    expect(screen.getAllByText(label)).toHaveLength(1)
    expect(
      screen.getByText(
        provider === "s3"
          ? "https://s3.example.com/books"
          : "reader@example.com",
      ),
    ).toBeTruthy()
    fireEvent.press(screen.getByText(label))
    expect(router.push).toHaveBeenCalledWith({
      pathname: `/settings/${provider}/[dataSourceId]`,
      params: { dataSourceId: `${provider}-1` },
    })
  })

  it("provides an add action in the empty account list", () => {
    render(<CloudSourcesScreen provider="dropbox" />)
    fireEvent.press(screen.getByText("cloud.sources.add"))
    expect(router.push).toHaveBeenCalledWith("/settings/dropbox/add")
  })

  it.each([
    "gdrive",
    "dropbox",
    "s3",
  ] as const)("shows %s details and routes editing without exposing credentials", async (provider) => {
    mockSources = [
      provider === "s3"
        ? s3Source
        : { ...oauthSource(provider), createdAt: 1700000000000 },
    ]
    mockParams = { dataSourceId: `${provider}-1` }
    render(<CloudDataSourceDetailScreen provider={provider} />)
    expect(
      screen.getByText(provider === "s3" ? "books" : "reader@example.com"),
    ).toBeTruthy()
    expect(screen.queryByText("configured-client")).toBeNull()
    await headerAction("cloud.edit")
    expect(router.push).toHaveBeenCalledWith({
      pathname: `/settings/${provider}/add`,
      params: { dataSourceId: `${provider}-1` },
    })
    if (provider !== "s3") {
      await headerAction("cloud.auth.reauthenticate")
      expect(mockReauthenticate).toHaveBeenCalledWith(mockSources[0])
    }
  })

  it.each([
    "success",
    "in-use",
    "failed",
  ])("handles confirmed deletion: %s", async (outcome) => {
    mockSources = [s3Source]
    mockParams = { dataSourceId: s3Source.id }
    jest.mocked(router.canGoBack).mockReturnValue(false)
    if (outcome === "in-use")
      mockDelete.mockRejectedValue(
        new DataSourceInUseError("in use", ["My Books"]),
      )
    if (outcome === "failed")
      mockDelete.mockRejectedValue(new Error("delete failed"))
    render(<CloudDataSourceDetailScreen provider="s3" />)
    await headerAction("cloud.delete.action")
    expect(mockDelete).not.toHaveBeenCalled()
    const buttons = jest.mocked(showAlertWithStatusBarRestore).mock
      .calls[0]?.[2]
    await act(async () =>
      buttons?.find((button) => button.style === "destructive")?.onPress?.(),
    )
    expect(mockDelete).toHaveBeenCalledWith(s3Source.id)
    if (outcome === "success")
      expect(router.replace).toHaveBeenCalledWith("/settings/s3")
    else {
      expect(router.replace).not.toHaveBeenCalled()
      if (outcome === "in-use")
        expect(showAlertWithStatusBarRestore).toHaveBeenLastCalledWith(
          "dataSource.deleteInUse.title",
          "dataSource.deleteInUse.message",
        )
      else
        expect(showErrorAlert).toHaveBeenCalledWith(
          "cloud.delete.failed",
          expect.stringContaining("delete failed"),
        )
    }
  })

  it("offers a route back when the source was removed", () => {
    mockParams = { dataSourceId: "removed" }
    render(<CloudDataSourceDetailScreen provider="gdrive" />)
    fireEvent.press(screen.getByText("dataSource.backToList"))
    expect(router.replace).toHaveBeenCalledWith("/settings/gdrive")
  })

  it.each([
    "gdrive",
    "dropbox",
  ] as const)("retries the %s browser only after successful reauthentication", async (provider) => {
    mockSources = [oauthSource(provider)]
    mockBrowser.resolveFailed = true
    render(
      <RemoteDirectoryBrowserScreen
        sourceType={provider}
        browserRoute={`/settings/${provider}/browser`}
        translationNamespace="cloud.browser"
      />,
    )
    fireEvent.press(screen.getByText("cloud.auth.reauthenticate"))
    await waitFor(() => expect(mockRetry).toHaveBeenCalledTimes(1))
    expect(mockReauthenticate).toHaveBeenCalledWith(mockSources[0])
  })

  it("returns S3 credential repair to the same browser directory", () => {
    mockSources = [s3Source]
    mockParams = {
      dataSourceId: "s3-1",
      libraryAction: "create",
      from: "add-library",
    }
    mockBrowser.resolveFailed = true
    render(
      <RemoteDirectoryBrowserScreen
        sourceType="s3"
        browserRoute="/settings/add-library/browser"
        translationNamespace="cloud.browser"
      />,
    )
    fireEvent.press(screen.getByText("cloud.auth.reauthenticate"))
    expect(router.push).toHaveBeenCalledWith({
      pathname: "/settings/s3/add",
      params: {
        dataSourceId: "s3-1",
        returnToBrowser: "true",
        returnPath: "/",
        libraryAction: "create",
        from: "add-library",
      },
    })
  })

  it("adds an empty folder draft on demand and supports confirming and cancelling it", async () => {
    mockSources = [oauthSource("dropbox")]
    mockParams = {
      dataSourceId: "dropbox-1",
      libraryAction: "create",
      from: "add-library",
    }
    render(
      <RemoteDirectoryBrowserScreen
        sourceType="dropbox"
        browserRoute="/settings/add-library/browser"
        translationNamespace="cloud.browser"
      />,
    )
    expect(screen.queryByLabelText("remoteFolder.name")).toBeNull()
    fireEvent.press(screen.getByText("remoteFolder.create"))
    expect(screen.getByLabelText("remoteFolder.name").props.value).toBe("")
    expect(screen.getByText("Existing")).toBeTruthy()
    await headerAction("addLibrary.continue")
    expect(router.push).not.toHaveBeenCalled()
    fireEvent.changeText(
      screen.getByLabelText("remoteFolder.name"),
      " Created ",
    )
    fireEvent.press(screen.getByText("common.confirm"))
    await waitFor(() =>
      expect(screen.queryByLabelText("remoteFolder.name")).toBeNull(),
    )
    expect(mockCreateDirectory).toHaveBeenCalledWith("Created")
    fireEvent.press(screen.getByText("remoteFolder.create"))
    fireEvent.press(screen.getByText("common.cancel"))
    expect(screen.queryByLabelText("remoteFolder.name")).toBeNull()
    expect(mockCreateDirectory).toHaveBeenCalledTimes(1)
    fireEvent.press(screen.getByText("Existing"))
    expect(router.push).toHaveBeenCalledWith({
      pathname: "/settings/add-library/browser",
      params: {
        dataSourceId: "dropbox-1",
        sourceType: "dropbox",
        currentPath: "/Existing",
        from: "add-library",
        libraryAction: "create",
      },
    })
    await headerAction("addLibrary.continue")
    expect(router.push).toHaveBeenLastCalledWith({
      pathname: "/settings/add-library/create",
      params: { dataSourceId: "dropbox-1", sourcePath: "/" },
    })
  })

  it("returns a missing cloud browser source to its account list", () => {
    mockBrowser.notFound = true
    render(
      <RemoteDirectoryBrowserScreen
        sourceType="gdrive"
        browserRoute="/settings/gdrive/browser"
        translationNamespace="cloud.browser"
      />,
    )
    fireEvent.press(screen.getByText("dataSource.backToList"))
    expect(router.replace).toHaveBeenCalledWith("/settings/gdrive")
  })
})
