const mockAuthorize = jest.fn()
const mockRefresh = jest.fn()
const mockDeleteAccessToken = jest.fn()
const mockDeleteRefreshToken = jest.fn()
const mockReadAccessToken = jest.fn()
const mockReadRefreshToken = jest.fn()
const mockWriteAccessToken = jest.fn()
const mockWriteRefreshToken = jest.fn()
const mockReadGoogleAccount = jest.fn()
const mockGoogleAuthorize = jest.fn()
const mockGoogleClearToken = jest.fn()

jest.mock("../../../modules/google-authorization/src", () => ({
  googleAuthorization: () => ({
    authorize: mockGoogleAuthorize,
    clearToken: mockGoogleClearToken,
  }),
}))

jest.mock("react-native-app-auth", () => ({
  authorize: (...args: unknown[]) => mockAuthorize(...args),
  refresh: (...args: unknown[]) => mockRefresh(...args),
}))

jest.mock("../storage/credentials", () => ({
  deleteCloudAccessToken: (...args: unknown[]) =>
    mockDeleteAccessToken(...args),
  deleteCloudRefreshToken: (...args: unknown[]) =>
    mockDeleteRefreshToken(...args),
  readCloudAccessToken: (...args: unknown[]) => mockReadAccessToken(...args),
  readCloudRefreshToken: (...args: unknown[]) => mockReadRefreshToken(...args),
  readGoogleAccount: (...args: unknown[]) => mockReadGoogleAccount(...args),
  writeCloudAccessToken: (...args: unknown[]) => mockWriteAccessToken(...args),
  writeCloudRefreshToken: (...args: unknown[]) =>
    mockWriteRefreshToken(...args),
}))

import { waitFor } from "@testing-library/react-native"
import { Platform } from "react-native"
import {
  configuredCloudClientId,
  invalidateCloudAccessToken,
  isUserCancelled,
  refreshCloudAccessToken,
  signInCloud,
} from "./cloud"

describe("cloud authentication", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockReadGoogleAccount.mockResolvedValue(null)
  })

  afterEach(() => jest.restoreAllMocks())

  it("requires a built-in Dropbox application key", () => {
    expect(configuredCloudClientId("dropbox")).toBeTruthy()
  })

  it("uses a stored access token until its expiry window", async () => {
    mockReadAccessToken.mockResolvedValue({
      accessToken: "cached-token",
      expiresAt: Date.now() + 60_000,
    })

    await expect(
      refreshCloudAccessToken("stored-source", "dropbox", "app-key"),
    ).resolves.toEqual({
      accessToken: "cached-token",
      expiresAt: expect.any(Number),
    })
    expect(mockRefresh).not.toHaveBeenCalled()
    expect(mockReadRefreshToken).not.toHaveBeenCalled()
  })

  it("shares one refresh request and persists a rotated refresh token", async () => {
    let resolveRefresh!: (value: {
      accessToken: string
      refreshToken: string
      accessTokenExpirationDate: string
    }) => void
    mockReadAccessToken.mockResolvedValue(null)
    mockReadRefreshToken.mockResolvedValue("refresh-token")
    mockRefresh.mockReturnValue(
      new Promise((resolve) => {
        resolveRefresh = resolve
      }),
    )

    const first = refreshCloudAccessToken(
      "concurrent-source",
      "gdrive",
      "client",
    )
    const second = refreshCloudAccessToken(
      "concurrent-source",
      "gdrive",
      "client",
    )
    await waitFor(() => expect(mockRefresh).toHaveBeenCalledTimes(1))
    resolveRefresh({
      accessToken: "new-access-token",
      refreshToken: "rotated-refresh-token",
      accessTokenExpirationDate: new Date(
        Date.now() + 60 * 60 * 1000,
      ).toISOString(),
    })

    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.objectContaining({ accessToken: "new-access-token" }),
      expect.objectContaining({ accessToken: "new-access-token" }),
    ])
    expect(mockWriteAccessToken).toHaveBeenCalledTimes(1)
    expect(mockWriteRefreshToken).toHaveBeenCalledWith(
      "concurrent-source",
      "rotated-refresh-token",
    )
  })

  it("clears invalid OAuth credentials after a rejected refresh", async () => {
    const error = Object.assign(new Error("invalid grant"), {
      code: "invalid_grant",
    })
    mockReadAccessToken.mockResolvedValue(null)
    mockReadRefreshToken.mockResolvedValue("revoked-refresh-token")
    mockRefresh.mockRejectedValue(error)

    await expect(
      refreshCloudAccessToken("revoked-source", "dropbox", "app-key"),
    ).rejects.toMatchObject({ name: "CredentialError", cause: error })
    expect(mockDeleteRefreshToken).toHaveBeenCalledWith("revoked-source")
    expect(mockDeleteAccessToken).toHaveBeenCalledWith("revoked-source")
  })

  it("uses the configured client and normalizes provider profile data", async () => {
    mockAuthorize.mockResolvedValue({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      accessTokenExpirationDate: new Date(
        Date.now() + 60 * 60 * 1000,
      ).toISOString(),
    })
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          sub: "google-user-123",
          email: "reader@example.com",
          name: "Reader",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    )

    await expect(signInCloud("gdrive")).resolves.toEqual({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresAt: expect.any(Number),
      accountId: "google-user-123",
      displayName: "Reader",
      email: "reader@example.com",
    })
    expect(mockAuthorize).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: expect.stringContaining(".apps.googleusercontent.com"),
        usePKCE: true,
      }),
    )
    fetchSpy.mockRestore()
  })

  it("invalidates the cached token before retrying a request", async () => {
    const sourceId = "invalidated-source"
    mockReadAccessToken.mockResolvedValue({
      accessToken: "old-token",
      expiresAt: Date.now() + 60_000,
    })
    await refreshCloudAccessToken(sourceId, "dropbox", "app-key")
    await invalidateCloudAccessToken(sourceId, "dropbox", "app-key")
    mockReadAccessToken.mockResolvedValue(null)
    mockReadRefreshToken.mockResolvedValue("refresh-token")
    mockRefresh.mockResolvedValue({ accessToken: "replacement-token" })

    await expect(
      refreshCloudAccessToken(sourceId, "dropbox", "app-key"),
    ).resolves.toEqual(
      expect.objectContaining({ accessToken: "replacement-token" }),
    )
    expect(mockRefresh).toHaveBeenCalledTimes(1)
  })

  function mockGoogleProfile(email = "reader@example.com") {
    jest.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ sub: "google-user", email, name: "Reader" }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    )
  }

  it("uses Android native authorization and binds its selected account without a refresh token", async () => {
    jest.replaceProperty(Platform, "OS", "android")
    mockGoogleAuthorize.mockResolvedValue("native-token")
    mockGoogleProfile()

    await expect(signInCloud("gdrive")).resolves.toEqual({
      accessToken: "native-token",
      refreshToken: "",
      googleAccount: "reader@example.com",
      expiresAt: expect.any(Number),
      accountId: "google-user",
      displayName: "Reader",
      email: "reader@example.com",
    })
    expect(mockGoogleAuthorize).toHaveBeenCalledWith(
      expect.arrayContaining(["https://www.googleapis.com/auth/drive"]),
      null,
      true,
    )
    expect(mockAuthorize).not.toHaveBeenCalled()
  })

  it("renews Android Google access silently for the bound account after expiry", async () => {
    jest.replaceProperty(Platform, "OS", "android")
    mockReadAccessToken.mockResolvedValue({
      accessToken: "expired",
      expiresAt: 1,
    })
    mockReadGoogleAccount.mockResolvedValue("reader@example.com")
    mockGoogleAuthorize.mockResolvedValue("renewed")
    mockGoogleProfile()

    await expect(
      refreshCloudAccessToken("native-renew", "gdrive"),
    ).resolves.toEqual({
      accessToken: "renewed",
      expiresAt: expect.any(Number),
    })
    expect(mockGoogleClearToken).toHaveBeenCalledWith("expired")
    expect(mockGoogleAuthorize).toHaveBeenCalledWith(
      expect.any(Array),
      "reader@example.com",
      false,
    )
    expect(mockWriteAccessToken).toHaveBeenCalledWith(
      "native-renew",
      expect.objectContaining({ accessToken: "renewed" }),
    )
    expect(mockRefresh).not.toHaveBeenCalled()
    expect(mockWriteRefreshToken).not.toHaveBeenCalled()
  })

  it("rejects a different native account without persisting its token", async () => {
    jest.replaceProperty(Platform, "OS", "android")
    mockReadAccessToken.mockResolvedValue(null)
    mockReadGoogleAccount.mockResolvedValue("reader@example.com")
    mockGoogleAuthorize.mockResolvedValue("wrong-account-token")
    mockGoogleProfile("another@example.com")

    await expect(
      refreshCloudAccessToken("native-mismatch", "gdrive"),
    ).rejects.toMatchObject({ name: "CredentialError" })
    expect(mockWriteAccessToken).not.toHaveBeenCalled()
  })

  it("requires explicit reauthentication instead of opening UI during a silent refresh", async () => {
    jest.replaceProperty(Platform, "OS", "android")
    mockReadAccessToken.mockResolvedValue(null)
    mockReadGoogleAccount.mockResolvedValue("reader@example.com")
    mockGoogleAuthorize.mockRejectedValue({ code: "authorization_required" })

    await expect(
      refreshCloudAccessToken("native-revoked", "gdrive"),
    ).rejects.toMatchObject({ name: "CredentialError" })
    expect(mockGoogleAuthorize).toHaveBeenCalledTimes(1)
    expect(mockGoogleAuthorize).toHaveBeenCalledWith(
      expect.any(Array),
      "reader@example.com",
      false,
    )
    expect(mockAuthorize).not.toHaveBeenCalled()
  })

  it("preserves native user cancellation and rejects missing access tokens", async () => {
    jest.replaceProperty(Platform, "OS", "android")
    const cancelled = { code: "user_cancelled" }
    mockGoogleAuthorize
      .mockRejectedValueOnce(cancelled)
      .mockResolvedValueOnce("")

    await expect(signInCloud("gdrive")).rejects.toBe(cancelled)
    expect(isUserCancelled(cancelled)).toBe(true)
    await expect(signInCloud("gdrive")).rejects.toMatchObject({
      name: "CredentialError",
    })
  })

  it("waits for the native token cache to be cleared during invalidation", async () => {
    jest.replaceProperty(Platform, "OS", "android")
    mockReadAccessToken.mockResolvedValue({
      accessToken: "rejected",
      expiresAt: 1,
    })
    mockReadGoogleAccount.mockResolvedValue("reader@example.com")
    let finishClear!: () => void
    mockGoogleClearToken.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishClear = resolve
      }),
    )
    const invalidation = invalidateCloudAccessToken(
      "native-invalidated",
      "gdrive",
    )
    await waitFor(() =>
      expect(mockGoogleClearToken).toHaveBeenCalledWith("rejected"),
    )
    finishClear()
    await invalidation
    expect(mockDeleteAccessToken).toHaveBeenCalledWith("native-invalidated")
  })
})
