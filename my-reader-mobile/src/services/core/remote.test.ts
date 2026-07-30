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
jest.mock("my-reader-core", () => ({
  registryTestRemoteDataSource: jest.fn(),
}))

import type { DataSourceOnedrive } from "@my-reader/tools/types/data-source"
import { registryTestRemoteDataSource } from "my-reader-core"
import { testRemoteDataSource } from "./remote"

describe("core remote adapter", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("should pass only stable source fields and short-lived credential when OneDrive is tested", async () => {
    jest.mocked(registryTestRemoteDataSource).mockResolvedValue()
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

    expect(registryTestRemoteDataSource).toHaveBeenCalledWith(
      {
        kind: "onedrive",
        id: "source",
        name: "OneDrive",
        enabled: true,
        clientId: "client",
        tenantId: "consumers",
        displayName: undefined,
        email: undefined,
        rootPath: undefined,
        hasRefreshToken: true,
        readonly: undefined,
        createdAt: undefined,
      },
      {
        kind: "onedrive",
        accessToken: "short-lived-access-token",
      },
    )
  })
})
