import type { DataSourceOnedrive } from "@my-reader/tools/types/data-source"
import { act, renderHook } from "@testing-library/react-native"
import { Alert } from "react-native"

import {
  invalidateOneDriveAccessToken,
  signIn,
} from "@/src/services/auth/onedrive"
import { useAddOneDriveDataSource } from "./use-add-onedrive-data-source"

const mockCreateDataSource = jest.fn()
const mockUpdateDataSource = jest.fn()
const mockDataSources: DataSourceOnedrive[] = []

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
  }),
}))

jest.mock("@/src/services/auth/onedrive", () => ({
  invalidateOneDriveAccessToken: jest.fn(),
  isUserCancelled: jest.fn(() => false),
  signIn: jest.fn(),
}))

jest.mock("@/src/store/app-store", () => ({
  useAppStore: (selector: (state: object) => unknown) =>
    selector({ dataSources: mockDataSources }),
}))

jest.mock("@/src/hooks/use-data-source-actions", () => ({
  useDataSourceActions: () => ({
    createDataSource: mockCreateDataSource,
    updateDataSource: mockUpdateDataSource,
  }),
}))

const source: DataSourceOnedrive = {
  id: "onedrive-1",
  type: "onedrive",
  name: "Reader",
  enabled: true,
  clientId: "",
  displayName: "Reader",
  email: "reader@example.com",
  rootPath: "/Books",
  hasRefreshToken: false,
}

describe("useAddOneDriveDataSource", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.mocked(signIn).mockResolvedValue({
      accessToken: "new-access-token",
      refreshToken: "new-refresh-token",
      displayName: "Reader Updated",
      email: "reader@example.com",
    })
    mockUpdateDataSource.mockResolvedValue(undefined)
  })

  it("should replace credentials on the existing source when the same account signs in again", async () => {
    const { result } = renderHook(() => useAddOneDriveDataSource())

    let authenticated = false
    await act(async () => {
      authenticated =
        await result.current.reauthenticateOneDriveDataSource(source)
    })

    expect(authenticated).toBe(true)
    expect(mockUpdateDataSource).toHaveBeenCalledWith(
      expect.objectContaining({
        id: source.id,
        displayName: "Reader Updated",
        email: source.email,
        rootPath: source.rootPath,
        hasRefreshToken: true,
      }),
      {
        type: "onedrive",
        accessToken: "new-access-token",
        refreshToken: "new-refresh-token",
      },
    )
    expect(invalidateOneDriveAccessToken).toHaveBeenCalledWith(source.id)
  })

  it("should keep the source unchanged when a different account signs in", async () => {
    const alertSpy = jest.spyOn(Alert, "alert")
    jest.mocked(signIn).mockResolvedValue({
      accessToken: "other-access-token",
      refreshToken: "other-refresh-token",
      displayName: "Other Reader",
      email: "other@example.com",
    })
    const { result } = renderHook(() => useAddOneDriveDataSource())

    let authenticated = true
    await act(async () => {
      authenticated =
        await result.current.reauthenticateOneDriveDataSource(source)
    })

    expect(authenticated).toBe(false)
    expect(mockUpdateDataSource).not.toHaveBeenCalled()
    expect(alertSpy).toHaveBeenCalledWith(
      "onedrive.add.accountMismatch",
      `onedrive.add.accountMismatchMessage:${JSON.stringify({ email: source.email })}`,
    )
  })
})
