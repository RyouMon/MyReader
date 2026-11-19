import type { DataSource } from "@my-reader/tools/types/data-source"
import { CredentialError } from "@/src/errors"
import { refreshCloudAccessToken } from "../auth/cloud"
import { refreshAccessToken } from "../auth/onedrive"
import {
  readOneDriveRefreshToken,
  readS3Credentials,
  readWebDavPassword,
} from "../storage/credentials"
import { resolveRemoteCredential } from "./remote-credentials"

jest.mock("../auth/cloud", () => ({ refreshCloudAccessToken: jest.fn() }))
jest.mock("../auth/onedrive", () => ({ refreshAccessToken: jest.fn() }))
jest.mock("../storage/credentials", () => ({
  readOneDriveRefreshToken: jest.fn(),
  readS3Credentials: jest.fn(),
  readWebDavPassword: jest.fn(),
}))

const base = { id: "source", name: "Source", enabled: true }
describe("remote credential boundary", () => {
  beforeEach(() => jest.resetAllMocks())

  it.each([
    "gdrive",
    "dropbox",
  ] as const)("uses explicit %s credentials for testing and refreshes saved credentials for normal use", async (type) => {
    const source: DataSource = {
      ...base,
      type,
      clientId: "client",
      hasRefreshToken: true,
    }
    await expect(
      resolveRemoteCredential(source, {
        type,
        accessToken: "temporary",
        refreshToken: "refresh",
      }),
    ).resolves.toEqual({ kind: type, accessToken: "temporary" })
    expect(refreshCloudAccessToken).not.toHaveBeenCalled()
    jest
      .mocked(refreshCloudAccessToken)
      .mockResolvedValue({ accessToken: "fresh", expiresAt: 123 })
    await expect(resolveRemoteCredential(source)).resolves.toEqual({
      kind: type,
      accessToken: "fresh",
    })
    expect(refreshCloudAccessToken).toHaveBeenCalledWith(
      "source",
      type,
      "client",
    )
  })

  it("uses S3 session credentials without adding them to source configuration", async () => {
    const source: DataSource = {
      ...base,
      type: "s3",
      endpoint: "https://storage.example",
      bucket: "books",
      region: "us-east-1",
      virtualHostStyle: false,
      hasCredentials: true,
    }
    const credentials = {
      accessKeyId: "key",
      secretAccessKey: " secret ",
      sessionToken: "session",
    }
    jest.mocked(readS3Credentials).mockResolvedValue(credentials)
    await expect(resolveRemoteCredential(source)).resolves.toEqual({
      kind: "s3",
      ...credentials,
    })
    await expect(
      resolveRemoteCredential(source, { type: "s3", ...credentials }),
    ).resolves.toEqual({ kind: "s3", ...credentials })
    expect(readS3Credentials).toHaveBeenCalledTimes(1)
    jest.mocked(readS3Credentials).mockResolvedValue(null)
    await expect(resolveRemoteCredential(source)).rejects.toBeInstanceOf(
      CredentialError,
    )
  })

  it("preserves WebDAV password bytes and rejects missing credentials", async () => {
    const source: DataSource = {
      ...base,
      type: "webdav",
      endpoint: "https://dav.example",
      username: "reader",
      hasPassword: true,
    }
    jest.mocked(readWebDavPassword).mockResolvedValue(" password ")
    await expect(resolveRemoteCredential(source)).resolves.toEqual({
      kind: "webdav",
      password: " password ",
    })
    await expect(
      resolveRemoteCredential(source, { type: "webdav", password: "new" }),
    ).resolves.toEqual({ kind: "webdav", password: "new" })
    jest.mocked(readWebDavPassword).mockResolvedValue(null)
    await expect(resolveRemoteCredential(source)).rejects.toThrow(
      "WEBDAV_PASSWORD_REQUIRED",
    )
  })

  it("refreshes OneDrive only when a refresh token is present", async () => {
    const source: DataSource = {
      ...base,
      type: "onedrive",
      clientId: "client",
      hasRefreshToken: true,
    }
    await expect(
      resolveRemoteCredential(source, {
        type: "onedrive",
        accessToken: "temporary",
      }),
    ).resolves.toEqual({ kind: "onedrive", accessToken: "temporary" })
    await expect(resolveRemoteCredential(source)).rejects.toThrow(
      "ONEDRIVE_REFRESH_TOKEN_REQUIRED",
    )
    expect(refreshAccessToken).not.toHaveBeenCalled()
    jest.mocked(readOneDriveRefreshToken).mockResolvedValue("refresh")
    jest
      .mocked(refreshAccessToken)
      .mockResolvedValue({ accessToken: "fresh", expiresAt: 123 })
    await expect(resolveRemoteCredential(source)).resolves.toEqual({
      kind: "onedrive",
      accessToken: "fresh",
    })
  })
})
