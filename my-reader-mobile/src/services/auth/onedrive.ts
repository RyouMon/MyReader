import { authorize, refresh, revoke } from "react-native-app-auth"

import {
  ONEDRIVE_CLIENT_ID,
  ONEDRIVE_ISSUER,
  ONEDRIVE_REDIRECT_URL,
  ONEDRIVE_SCOPES,
} from "../../constants/onedrive"
import {
  deleteOneDriveAccessToken,
  deleteOneDriveRefreshToken,
  readOneDriveAccessToken,
  readOneDriveRefreshToken,
  writeOneDriveAccessToken,
  writeOneDriveRefreshToken,
} from "../storage/credentials"

const authConfig = {
  issuer: ONEDRIVE_ISSUER,
  clientId: ONEDRIVE_CLIENT_ID,
  redirectUrl: ONEDRIVE_REDIRECT_URL,
  scopes: ONEDRIVE_SCOPES,
  serviceConfiguration: {
    authorizationEndpoint:
      "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenEndpoint: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    revocationEndpoint:
      "https://login.microsoftonline.com/common/oauth2/v2.0/logout",
  },
  useNonce: true,
  usePKCE: true,
  additionalParameters: {
    prompt: "login" as const,
  },
}

type AccessTokenState = {
  accessToken: string
  expiresAt: number
}

const EXPIRY_SKEW_MS = 5 * 60 * 1000
const accessTokens = new Map<string, AccessTokenState>()
const refreshes = new Map<string, Promise<AccessTokenState>>()
const rejectedAccessTokens = new Set<string>()

function accessTokenExpiresAt(accessToken: string): number | null {
  try {
    const encoded = accessToken.split(".")[1]
    if (!encoded) return null
    const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/")
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      "=",
    )
    const payload = JSON.parse(atob(padded)) as { exp?: number }
    return typeof payload.exp === "number"
      ? payload.exp * 1000 - EXPIRY_SKEW_MS
      : null
  } catch {
    return null
  }
}

function resultExpiresAt(
  accessToken: string,
  expirationDate: string | undefined,
): number {
  const responseExpiry = expirationDate
    ? new Date(expirationDate).getTime() - EXPIRY_SKEW_MS
    : Number.NaN
  if (Number.isFinite(responseExpiry)) return responseExpiry
  return accessTokenExpiresAt(accessToken) ?? Date.now() + EXPIRY_SKEW_MS
}

function isFresh(
  state: AccessTokenState | undefined,
): state is AccessTokenState {
  return Boolean(state && Date.now() < state.expiresAt)
}

export function invalidateOneDriveAccessToken(dataSourceId: string): void {
  accessTokens.delete(dataSourceId)
  rejectedAccessTokens.add(dataSourceId)
}

export function isUserCancelled(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  // User closed the browser/SFSafariViewController on iOS (AppAuth general error -3)
  return error.message?.includes("error -3") ?? false
}

export async function signIn(): Promise<{
  accessToken: string
  refreshToken: string
  displayName: string
  email: string
}> {
  const result = await authorize(authConfig)

  let displayName = ""
  let email = ""

  try {
    const meRes = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${result.accessToken}` },
    })
    const me = await meRes.json()
    displayName = me.displayName ?? ""
    email = me.mail ?? me.userPrincipalName ?? ""
  } catch {
    if (result.idToken != null) {
      try {
        const idTokenPayload = result.idToken.split(".")[1]
        if (idTokenPayload != null) {
          const claims = JSON.parse(atob(idTokenPayload))
          displayName = claims.name ?? ""
          email = claims.email ?? claims.preferred_username ?? ""
        }
      } catch {
        // idToken parse failed
      }
    }
  }

  return {
    accessToken: result.accessToken,
    refreshToken: result.refreshToken ?? "",
    displayName,
    email,
  }
}

export async function refreshAccessToken(
  dataSourceId: string,
): Promise<{ accessToken: string; expiresAt: number }> {
  const cached = accessTokens.get(dataSourceId)
  if (isFresh(cached)) return cached

  const existingRefresh = refreshes.get(dataSourceId)
  if (existingRefresh) return existingRefresh

  const pendingRefresh = (async () => {
    const storedAccessToken = await readOneDriveAccessToken(dataSourceId)
    const storedExpiresAt = storedAccessToken
      ? accessTokenExpiresAt(storedAccessToken)
      : null
    if (
      !rejectedAccessTokens.has(dataSourceId) &&
      storedAccessToken &&
      storedExpiresAt !== null &&
      Date.now() < storedExpiresAt
    ) {
      const stored = {
        accessToken: storedAccessToken,
        expiresAt: storedExpiresAt,
      }
      accessTokens.set(dataSourceId, stored)
      return stored
    }

    const refreshToken = await readOneDriveRefreshToken(dataSourceId)
    if (!refreshToken) {
      throw new Error("No refresh token available")
    }

    const result = await refresh(authConfig, { refreshToken })
    const next = {
      accessToken: result.accessToken,
      expiresAt: resultExpiresAt(
        result.accessToken,
        result.accessTokenExpirationDate,
      ),
    }
    await writeOneDriveAccessToken(dataSourceId, result.accessToken)
    if (result.refreshToken) {
      await writeOneDriveRefreshToken(dataSourceId, result.refreshToken)
    }
    rejectedAccessTokens.delete(dataSourceId)
    accessTokens.set(dataSourceId, next)
    return next
  })()
  refreshes.set(dataSourceId, pendingRefresh)
  try {
    return await pendingRefresh
  } finally {
    if (refreshes.get(dataSourceId) === pendingRefresh) {
      refreshes.delete(dataSourceId)
    }
  }
}

export async function getValidAccessToken(
  dataSourceId: string,
): Promise<{ accessToken: string; expiresAt: number }> {
  const { accessToken, expiresAt } = await refreshAccessToken(dataSourceId)
  return { accessToken, expiresAt }
}

export async function revokeAuth(dataSourceId: string): Promise<void> {
  invalidateOneDriveAccessToken(dataSourceId)
  const token = await readOneDriveAccessToken(dataSourceId)
  if (token) {
    try {
      await revoke(authConfig, { tokenToRevoke: token })
    } catch {
      // Revocation may fail if token already expired — ignore
    }
  }
  await deleteOneDriveAccessToken(dataSourceId)
  await deleteOneDriveRefreshToken(dataSourceId)
}
