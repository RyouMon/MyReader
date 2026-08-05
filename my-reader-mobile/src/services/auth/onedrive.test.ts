const mockRefresh = jest.fn()
const mockRevoke = jest.fn()
const mockReadAccessToken = jest.fn()
const mockReadRefreshToken = jest.fn()
const mockWriteAccessToken = jest.fn()
const mockWriteRefreshToken = jest.fn()

jest.mock("react-native-app-auth", () => ({
  authorize: jest.fn(),
  refresh: (...args: unknown[]) => mockRefresh(...args),
  revoke: (...args: unknown[]) => mockRevoke(...args),
}))

jest.mock("../storage/credentials", () => ({
  deleteOneDriveAccessToken: jest.fn(),
  deleteOneDriveRefreshToken: jest.fn(),
  readOneDriveAccessToken: (...args: unknown[]) => mockReadAccessToken(...args),
  readOneDriveRefreshToken: (...args: unknown[]) =>
    mockReadRefreshToken(...args),
  writeOneDriveAccessToken: (...args: unknown[]) =>
    mockWriteAccessToken(...args),
  writeOneDriveRefreshToken: (...args: unknown[]) =>
    mockWriteRefreshToken(...args),
}))

import { invalidateOneDriveAccessToken, refreshAccessToken } from "./onedrive"

function accessToken(expirationMs: number): string {
  const payload = btoa(JSON.stringify({ exp: Math.floor(expirationMs / 1000) }))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
  return `header.${payload}.signature`
}

describe("OneDrive access token refresh", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("should reuse a stored access token when it is still valid", async () => {
    const token = accessToken(Date.now() + 60 * 60 * 1000)
    mockReadAccessToken.mockResolvedValue(token)

    const result = await refreshAccessToken("stored-token-source")

    expect(result.accessToken).toBe(token)
    expect(result.expiresAt).toBeGreaterThan(Date.now())
    expect(mockReadRefreshToken).not.toHaveBeenCalled()
    expect(mockRefresh).not.toHaveBeenCalled()
  })

  it("should share one refresh when concurrent requests need a token", async () => {
    let resolveRefresh!: (value: {
      accessToken: string
      accessTokenExpirationDate: string
      refreshToken: string
    }) => void
    mockReadAccessToken.mockResolvedValue(null)
    mockReadRefreshToken.mockResolvedValue("refresh-token")
    mockRefresh.mockReturnValue(
      new Promise((resolve) => {
        resolveRefresh = resolve
      }),
    )

    const first = refreshAccessToken("concurrent-source")
    const second = refreshAccessToken("concurrent-source")
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    expect(mockRefresh).toHaveBeenCalledTimes(1)
    resolveRefresh({
      accessToken: "new-access-token",
      accessTokenExpirationDate: new Date(
        Date.now() + 60 * 60 * 1000,
      ).toISOString(),
      refreshToken: "rotated-refresh-token",
    })

    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.objectContaining({ accessToken: "new-access-token" }),
      expect.objectContaining({ accessToken: "new-access-token" }),
    ])
    expect(mockWriteAccessToken).toHaveBeenCalledTimes(1)
    expect(mockWriteRefreshToken).toHaveBeenCalledTimes(1)
  })

  it("should refresh instead of reusing a rejected access token", async () => {
    const dataSourceId = "rejected-token-source"
    const token = accessToken(Date.now() + 60 * 60 * 1000)
    mockReadAccessToken.mockResolvedValue(token)
    await refreshAccessToken(dataSourceId)

    invalidateOneDriveAccessToken(dataSourceId)
    mockReadRefreshToken.mockResolvedValue("refresh-token")
    mockRefresh.mockResolvedValue({
      accessToken: "replacement-token",
      accessTokenExpirationDate: new Date(
        Date.now() + 60 * 60 * 1000,
      ).toISOString(),
    })

    await expect(refreshAccessToken(dataSourceId)).resolves.toEqual(
      expect.objectContaining({ accessToken: "replacement-token" }),
    )
    expect(mockRefresh).toHaveBeenCalledTimes(1)
  })
})
