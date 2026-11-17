const mockStore = new Map<string, string>()

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn((key: string) =>
    Promise.resolve(mockStore.get(key) ?? null),
  ),
  setItemAsync: jest.fn((key: string, value: string) => {
    mockStore.set(key, value)
    return Promise.resolve()
  }),
  deleteItemAsync: jest.fn((key: string) => {
    mockStore.delete(key)
    return Promise.resolve()
  }),
}))

import {
  deleteSecrets,
  deriveCredentialFlags,
  hydrateDataSourcesFromSecureCredentials,
  readCloudRefreshToken,
  readGoogleAccount,
  readS3Credentials,
  writeSecrets,
} from "./credentials"

describe("secure cloud credentials", () => {
  beforeEach(() => mockStore.clear())

  it("round-trips S3 credentials without placing them in the data-source record", async () => {
    await writeSecrets("s3-source", {
      type: "s3",
      accessKeyId: "access-key",
      secretAccessKey: "secret-key",
      sessionToken: "session-token",
    })

    await expect(readS3Credentials("s3-source")).resolves.toEqual({
      accessKeyId: "access-key",
      secretAccessKey: "secret-key",
      sessionToken: "session-token",
    })
    expect(mockStore.has("ryoumon.myreader.s3.s3-source")).toBe(true)
  })

  it("removes all provider secrets when a source is deleted", async () => {
    await writeSecrets("s3-source", {
      type: "s3",
      accessKeyId: "access-key",
      secretAccessKey: "secret-key",
    })

    await deleteSecrets("s3-source", "s3")

    await expect(readS3Credentials("s3-source")).resolves.toBeNull()
  })

  it("rejects malformed stored S3 JSON", async () => {
    mockStore.set("ryoumon.myreader.s3.s3-source", "not-json")

    await expect(readS3Credentials("s3-source")).resolves.toBeNull()
  })

  it("persists a native Google account binding, hydrates it and removes it with the source", async () => {
    const secrets = {
      type: "gdrive" as const,
      accessToken: "native-token",
      refreshToken: "",
      googleAccount: "reader@example.com",
    }
    await writeSecrets("native-google", secrets)
    expect(deriveCredentialFlags(secrets)).toEqual({ hasRefreshToken: true })
    await expect(readGoogleAccount("native-google")).resolves.toBe(
      "reader@example.com",
    )
    await expect(readCloudRefreshToken("native-google")).resolves.toBeNull()
    await expect(
      hydrateDataSourcesFromSecureCredentials([
        {
          id: "native-google",
          type: "gdrive",
          name: "Reader",
          enabled: true,
          clientId: "android-client",
          hasRefreshToken: false,
        },
      ]),
    ).resolves.toEqual([expect.objectContaining({ hasRefreshToken: true })])

    await deleteSecrets("native-google", "gdrive")
    await expect(readGoogleAccount("native-google")).resolves.toBeNull()
    expect(mockStore.size).toBe(0)
  })
})
