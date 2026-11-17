import type {
  DataSourceDropbox,
  DataSourceGdrive,
} from "@my-reader/tools/types/data-source"
import { act, renderHook } from "@testing-library/react-native"
import { Alert } from "react-native"
import { showErrorAlert } from "@/src/constants/alert-with-status-bar"
import {
  configuredCloudClientId,
  invalidateCloudAccessToken,
  isUserCancelled,
  signInCloud,
} from "@/src/services/auth/cloud"
import { useCloudDataSource } from "./use-cloud-data-source"

const mockUpdate = jest.fn()
let mockSources: (DataSourceGdrive | DataSourceDropbox)[] = []
jest.mock("react-i18next", () => ({
  ...jest.requireActual("react-i18next"),
  useTranslation: () => ({ t: (key: string) => key }),
}))
jest.mock("@/src/constants/alert-with-status-bar", () => ({
  showErrorAlert: jest.fn(),
}))
jest.mock("@/src/services/auth/cloud", () => ({
  configuredCloudClientId: jest.fn(() => "configured-client"),
  invalidateCloudAccessToken: jest.fn(),
  isUserCancelled: jest.fn(),
  signInCloud: jest.fn(),
}))
jest.mock("@/src/hooks/use-data-source-actions", () => ({
  useDataSourceActions: () => ({ updateDataSource: mockUpdate }),
}))
jest.mock("@/src/store/app-store", () => ({
  useAppStore: (select: (state: object) => unknown) =>
    select({ dataSources: mockSources }),
}))

const account = {
  accountId: "account-1",
  displayName: "Reader",
  email: "reader@example.com",
  accessToken: "access",
  refreshToken: "refresh",
  expiresAt: 123,
  googleAccount: "reader@example.com",
}
const source: DataSourceGdrive = {
  id: "source-1",
  type: "gdrive",
  name: "Old name",
  enabled: true,
  clientId: "old-client",
  accountId: "account-1",
  rootPath: "/Books",
  hasRefreshToken: false,
}

describe("cloud authentication workflow", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSources = []
    jest.mocked(signInCloud).mockResolvedValue(account)
    jest.mocked(isUserCancelled).mockReturnValue(false)
    mockUpdate.mockResolvedValue(undefined)
  })

  it.each([
    "gdrive",
    "dropbox",
  ] as const)("returns %s account metadata separately from credentials", async (provider) => {
    const { result } = renderHook(useCloudDataSource)
    await act(async () => {
      expect(await result.current.authenticate(provider)).toEqual({
        source: {
          id: "",
          type: provider,
          name: "Reader",
          enabled: true,
          clientId: "configured-client",
          accountId: "account-1",
          displayName: "Reader",
          email: "reader@example.com",
          rootPath: null,
          hasRefreshToken: true,
        },
        accessToken: "access",
        refreshToken: "refresh",
        expiresAt: 123,
        googleAccount: "reader@example.com",
      })
    })
    expect(configuredCloudClientId).toHaveBeenCalledWith(provider)
    expect(result.current.busy).toBe(false)
  })

  it("rejects an existing account for the same provider", async () => {
    mockSources = [source]
    const alert = jest.spyOn(Alert, "alert")
    const { result } = renderHook(useCloudDataSource)
    await act(async () =>
      expect(await result.current.authenticate("gdrive")).toBeNull(),
    )
    expect(alert).toHaveBeenCalledWith(
      "cloud.auth.alreadyAdded.title",
      "cloud.auth.alreadyAdded.detail",
    )
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it("serializes sign-in across mounted screens and releases the lock", async () => {
    let finish!: (value: typeof account) => void
    jest.mocked(signInCloud).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const first = renderHook(useCloudDataSource)
    const second = renderHook(useCloudDataSource)
    let pending!: ReturnType<typeof first.result.current.authenticate>
    act(() => {
      pending = first.result.current.authenticate("gdrive")
    })
    expect(first.result.current.busy).toBe(true)
    expect(second.result.current.busy).toBe(true)
    await act(async () => {
      expect(await second.result.current.authenticate("dropbox")).toBeNull()
      expect(await second.result.current.reauthenticate(source)).toBe(false)
      finish(account)
      await pending
    })
    expect(signInCloud).toHaveBeenCalledTimes(1)
    expect(second.result.current.busy).toBe(false)
  })

  it("replaces credentials for the original account while retaining the source root", async () => {
    const { result } = renderHook(useCloudDataSource)
    await act(async () =>
      expect(await result.current.reauthenticate(source)).toBe(true),
    )
    expect(mockUpdate).toHaveBeenCalledWith(
      {
        ...source,
        name: "Reader",
        clientId: "configured-client",
        displayName: "Reader",
        email: "reader@example.com",
        hasRefreshToken: true,
      },
      {
        type: "gdrive",
        accessToken: "access",
        refreshToken: "refresh",
        accessTokenExpiresAt: 123,
        googleAccount: "reader@example.com",
      },
    )
    expect(invalidateCloudAccessToken).toHaveBeenCalledWith(source.id, "gdrive")
  })

  it("refuses to replace a source with a different account", async () => {
    jest
      .mocked(signInCloud)
      .mockResolvedValue({ ...account, accountId: "other" })
    const alert = jest.spyOn(Alert, "alert")
    const { result } = renderHook(useCloudDataSource)
    await act(async () =>
      expect(await result.current.reauthenticate(source)).toBe(false),
    )
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(invalidateCloudAccessToken).not.toHaveBeenCalled()
    expect(alert).toHaveBeenCalledWith(
      "cloud.auth.accountMismatch.title",
      "cloud.auth.accountMismatch.detail",
    )
  })

  it.each([
    "authenticate",
    "reauthenticate",
  ] as const)("recovers from %s failures and suppresses cancellation alerts", async (operation) => {
    const { result } = renderHook(useCloudDataSource)
    jest.mocked(signInCloud).mockRejectedValue(new Error("offline"))
    await act(async () => {
      if (operation === "authenticate")
        expect(await result.current.authenticate("gdrive")).toBeNull()
      else expect(await result.current.reauthenticate(source)).toBe(false)
    })
    expect(showErrorAlert).toHaveBeenCalledWith(
      "cloud.auth.failed.title",
      expect.stringContaining("offline"),
    )
    expect(result.current.busy).toBe(false)
    jest.mocked(showErrorAlert).mockClear()
    jest.mocked(isUserCancelled).mockReturnValue(true)
    await act(async () => {
      if (operation === "authenticate")
        await result.current.authenticate("gdrive")
      else await result.current.reauthenticate(source)
    })
    expect(showErrorAlert).not.toHaveBeenCalled()
    expect(result.current.busy).toBe(false)
  })
})
