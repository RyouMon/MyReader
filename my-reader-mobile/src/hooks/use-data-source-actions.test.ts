import type { DataSourceWebdav } from "@my-reader/tools/types/data-source"
import { act, renderHook } from "@testing-library/react-native"

import { removeAppDataSource } from "@/src/services/core/app-config"
import { deleteSecrets } from "@/src/services/storage/credentials"

import { useDataSourceActions } from "./use-data-source-actions"

const mockSetDataSources = jest.fn()
let mockDataSources: DataSourceWebdav[] = []

jest.mock("@/src/services/core/app-config", () => ({
  initializeAppConfig: jest.fn(),
  prepareAppDataSourceForUpsert: jest.fn(),
  removeAppDataSource: jest.fn(),
  upsertAppDataSource: jest.fn(),
}))

jest.mock("@/src/services/core/remote", () => ({
  testRemoteDataSource: jest.fn(),
}))

jest.mock("@/src/services/storage/credentials", () => ({
  deleteSecrets: jest.fn(),
  deriveCredentialFlags: jest.fn(),
  hydrateDataSourcesFromSecureCredentials: jest.fn(),
  writeSecrets: jest.fn(),
}))

jest.mock("@/src/store/app-store", () => ({
  useAppStore: {
    getState: () => ({
      activeLibraryId: null,
      dataSources: mockDataSources,
      libraries: [],
      setDataSources: mockSetDataSources,
      setStoreReady: jest.fn(),
    }),
  },
}))

describe("useDataSourceActions", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockDataSources = []
  })

  it("should resolve before credential cleanup finishes when deleting a data source", async () => {
    const source: DataSourceWebdav = {
      id: "source-1",
      type: "webdav",
      name: "WebDAV",
      enabled: true,
      endpoint: "https://dav.example.com",
      username: "reader",
      hasPassword: true,
    }
    let cleanupFinished = false
    let finishCleanup: (() => void) | undefined
    mockDataSources = [source]
    jest.mocked(removeAppDataSource).mockResolvedValue({
      schemaVersion: 1,
      deviceId: null,
      preferences: {
        theme: "system",
        language: "system",
      },
      activeLibraryId: null,
      dataSources: [],
      libraries: [],
      mobileJson: null,
    })
    jest.mocked(deleteSecrets).mockReturnValue(
      new Promise<void>((resolve) => {
        finishCleanup = () => {
          cleanupFinished = true
          resolve()
        }
      }),
    )
    const { result } = renderHook(() => useDataSourceActions())

    await act(async () => {
      await result.current.deleteDataSource(source.id)
    })

    expect(mockSetDataSources).toHaveBeenCalledWith([])
    expect(deleteSecrets).toHaveBeenCalledWith(source.id, source.type)
    expect(cleanupFinished).toBe(false)

    await act(async () => {
      finishCleanup?.()
    })
  })
})
