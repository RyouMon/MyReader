jest.mock("expo-file-system", () => ({
  Directory: jest.fn(() => ({
    uri: "file:///documents/libraries",
    exists: true,
    create: jest.fn(),
  })),
  File: jest.fn(() => ({ uri: "file:///documents/device-registry.json" })),
  Paths: { document: "file:///documents" },
}))
jest.mock("../fs/path", () => ({
  toNativeFilesystemPath: (uri: string) => uri.replace("file://", ""),
}))
jest.mock("../fs/library-paths", () => ({
  libraryContainerRootUri: (id: string) => `file:///documents/libraries/${id}`,
}))
jest.mock("../auth/onedrive", () => ({
  refreshAccessToken: jest.fn(),
}))
jest.mock("../storage/credentials", () => ({
  readOneDriveRefreshToken: jest.fn(),
  readWebDavPassword: jest.fn(),
}))
jest.mock("./transport", () => ({
  invokeCoreAsync: jest.fn(),
}))

import type { DataSourceOnedrive } from "@my-reader/tools/types/data-source"
import { testRemoteDataSource } from "./remote"
import { invokeCoreAsync } from "./transport"

describe("core remote adapter", () => {
  const mockInvokeCoreAsync = jest.mocked(invokeCoreAsync)

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("should pass only stable source fields and short-lived credential when OneDrive is tested", async () => {
    mockInvokeCoreAsync.mockResolvedValue(null)
    const source: DataSourceOnedrive = {
      id: "source",
      type: "onedrive",
      name: "OneDrive",
      enabled: true,
      clientId: "client",
      tenantId: "consumers",
      hasRefreshToken: true,
      refreshToken: "persisted-refresh-token",
      accessTokenExpiresAt: 123,
    }

    await testRemoteDataSource(source, {
      type: "onedrive",
      accessToken: "short-lived-access-token",
    })

    expect(mockInvokeCoreAsync).toHaveBeenCalledWith(
      "registry",
      "testRemoteDataSource",
      {
        source: {
          type: "onedrive",
          id: "source",
          name: "OneDrive",
          enabled: true,
          clientId: "client",
          tenantId: "consumers",
          displayName: null,
          email: null,
          rootPath: null,
          hasRefreshToken: true,
          credentialReference: null,
          readonly: null,
          createdAt: null,
        },
        credential: {
          type: "onedrive",
          accessToken: "short-lived-access-token",
        },
      },
    )
  })
})
