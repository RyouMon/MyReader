import { Platform } from "react-native"
import { authorize, refresh } from "react-native-app-auth"
import { googleAuthorization } from "../../../modules/google-authorization/src"
import {
  DROPBOX_APP_KEY,
  DROPBOX_REDIRECT_URL,
  DROPBOX_SCOPES,
  GOOGLE_DRIVE_CLIENT_IDS,
  GOOGLE_DRIVE_SCOPES,
} from "../../constants/cloud"
import { CredentialError, NetworkError, SyncConfigError } from "../../errors"
import {
  deleteCloudAccessToken,
  deleteCloudRefreshToken,
  readCloudAccessToken,
  readCloudRefreshToken,
  readGoogleAccount,
  writeCloudAccessToken,
  writeCloudRefreshToken,
} from "../storage/credentials"

export type CloudProvider = "gdrive" | "dropbox"

export type CloudAuthResult = {
  accessToken: string
  refreshToken: string
  expiresAt: number
  accountId: string
  displayName: string
  email: string
  googleAccount?: string
}

type CloudConfig = {
  clientId: string
  redirectUrl: string
  scopes: string[]
  serviceConfiguration: {
    authorizationEndpoint: string
    tokenEndpoint: string
  }
}

const GOOGLE_SERVICE_CONFIGURATION = {
  authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenEndpoint: "https://oauth2.googleapis.com/token",
}
const DROPBOX_SERVICE_CONFIGURATION = {
  authorizationEndpoint: "https://www.dropbox.com/oauth2/authorize",
  tokenEndpoint: "https://api.dropboxapi.com/oauth2/token",
}
const EXPIRY_SKEW_MS = 5 * 60 * 1000
type CachedToken = { accessToken: string; expiresAt: number }
const cached = new Map<string, CachedToken>()
const pending = new Map<string, Promise<CachedToken>>()
const generations = new Map<string, number>()

export function configuredCloudClientId(provider: CloudProvider): string {
  if (provider === "dropbox") return DROPBOX_APP_KEY.trim()
  return Platform.OS === "ios"
    ? GOOGLE_DRIVE_CLIENT_IDS.ios
    : GOOGLE_DRIVE_CLIENT_IDS.android
}

function clientIdForRefresh(
  provider: CloudProvider,
  clientId?: string,
): string {
  if (clientId?.trim()) return clientId.trim()
  return configuredCloudClientId(provider)
}

function googleRedirectUrl(clientId: string): string {
  const scheme = `com.googleusercontent.apps.${clientId.replace(
    ".apps.googleusercontent.com",
    "",
  )}`
  return `${scheme}:/oauthredirect`
}

function configFor(provider: CloudProvider, clientId?: string): CloudConfig {
  const resolvedClientId = clientIdForRefresh(provider, clientId)
  if (!resolvedClientId) throw new SyncConfigError("OAUTH_CLIENT_ID_REQUIRED")
  return provider === "gdrive"
    ? {
        clientId: resolvedClientId,
        redirectUrl: googleRedirectUrl(resolvedClientId),
        scopes: GOOGLE_DRIVE_SCOPES,
        serviceConfiguration: GOOGLE_SERVICE_CONFIGURATION,
      }
    : {
        clientId: resolvedClientId,
        redirectUrl: DROPBOX_REDIRECT_URL,
        scopes: DROPBOX_SCOPES,
        serviceConfiguration: DROPBOX_SERVICE_CONFIGURATION,
      }
}

function expiresAt(accessTokenExpirationDate?: string): number {
  const parsed = accessTokenExpirationDate
    ? new Date(accessTokenExpirationDate).getTime() - EXPIRY_SKEW_MS
    : Number.NaN
  return Number.isFinite(parsed) ? parsed : Date.now() + 50 * 60 * 1000
}

export function isUserCancelled(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "user_cancelled"
  )
}

export async function signInCloud(
  provider: CloudProvider,
): Promise<CloudAuthResult> {
  if (provider === "gdrive" && Platform.OS === "android") {
    const accessToken = await authorizeGoogleAndroid(null, true)
    const profile = await readProfile(provider, accessToken)
    if (!profile.email)
      throw new CredentialError("Google account email missing")
    return {
      accessToken,
      refreshToken: "",
      googleAccount: profile.email,
      expiresAt: expiresAt(),
      ...profile,
    }
  }
  const config = configFor(provider, configuredCloudClientId(provider))
  const result = await authorize({
    ...config,
    usePKCE: true,
    additionalParameters:
      provider === "gdrive"
        ? { access_type: "offline", prompt: "consent" }
        : { token_access_type: "offline" },
  }).catch((error: unknown) => {
    throw normalizeAuthError(error)
  })
  const accessToken = result.accessToken
  if (!accessToken?.trim())
    throw new CredentialError("OAUTH_ACCESS_TOKEN_REQUIRED")
  const refreshToken = result.refreshToken ?? ""
  if (!refreshToken) throw new CredentialError("OAUTH_REFRESH_TOKEN_REQUIRED")
  const tokenExpiresAt = expiresAt(result.accessTokenExpirationDate)
  const profile = await readProfile(provider, accessToken)
  return {
    accessToken,
    refreshToken,
    expiresAt: tokenExpiresAt,
    ...profile,
  }
}

export async function refreshCloudAccessToken(
  dataSourceId: string,
  provider: CloudProvider,
  clientId?: string,
): Promise<{ accessToken: string; expiresAt: number }> {
  const key = cacheKey(dataSourceId, provider, clientId)
  const current = cached.get(key)
  if (current && Date.now() < current.expiresAt) return current
  const existingBeforeRead = pending.get(key)
  if (existingBeforeRead) return existingBeforeRead
  const stored = await readCloudAccessToken(dataSourceId)
  if (stored && Date.now() < stored.expiresAt) {
    cached.set(key, stored)
    return stored
  }
  const googleAccount = await nativeGoogleAccount(dataSourceId, provider)
  const refreshToken = googleAccount
    ? null
    : await readCloudRefreshToken(dataSourceId)
  if (!googleAccount && !refreshToken)
    throw new CredentialError("OAUTH_REFRESH_TOKEN_REQUIRED")
  const existing = pending.get(key)
  if (existing) return existing
  const generation = generations.get(key) ?? 0
  const request = (async () => {
    if (googleAccount) {
      const next = await renewGoogleAndroid(googleAccount, stored?.accessToken)
      if ((generations.get(key) ?? 0) === generation) {
        await writeCloudAccessToken(dataSourceId, next)
        cached.set(key, next)
      }
      return next
    }
    const config = configFor(provider, clientId)
    const result = await refresh(config, { refreshToken: refreshToken! }).catch(
      (error: unknown) => {
        throw normalizeAuthError(error)
      },
    )
    if (!result.accessToken?.trim()) {
      throw new CredentialError("OAUTH_ACCESS_TOKEN_REQUIRED")
    }
    const next = {
      accessToken: result.accessToken,
      expiresAt: expiresAt(result.accessTokenExpirationDate),
    }
    if ((generations.get(key) ?? 0) === generation) {
      await writeCloudAccessToken(dataSourceId, next)
      if (result.refreshToken) {
        await writeCloudRefreshToken(dataSourceId, result.refreshToken)
      }
      cached.set(key, next)
    }
    return next
  })()
  pending.set(key, request)
  try {
    return await request
  } catch (error) {
    if (error instanceof CredentialError) {
      await invalidateCloudAccessToken(dataSourceId, provider, clientId)
      if (String(error.message).includes("authorization rejected")) {
        await deleteCloudRefreshToken(dataSourceId)
      }
    }
    throw error
  } finally {
    if (pending.get(key) === request) pending.delete(key)
  }
}

export async function invalidateCloudAccessToken(
  dataSourceId: string,
  provider?: CloudProvider,
  clientId?: string,
): Promise<void> {
  const knownKeys = new Set([
    ...cached.keys(),
    ...pending.keys(),
    ...generations.keys(),
  ])
  const keys = provider
    ? [cacheKey(dataSourceId, provider, clientId)]
    : [...knownKeys].filter((key) => key.endsWith(`:${dataSourceId}`))
  for (const key of keys) {
    generations.set(key, (generations.get(key) ?? 0) + 1)
    cached.delete(key)
  }
  const stored = await readCloudAccessToken(dataSourceId)
  await deleteCloudAccessToken(dataSourceId)
  if (
    Platform.OS === "android" &&
    stored?.accessToken &&
    (await readGoogleAccount(dataSourceId))
  ) {
    await googleAuthorization().clearToken(stored.accessToken)
  }
}

async function authorizeGoogleAndroid(
  account: string | null,
  interactive: boolean,
): Promise<string> {
  const token = await googleAuthorization()
    .authorize(GOOGLE_DRIVE_SCOPES, account, interactive)
    .catch((error: unknown) => {
      throw normalizeAuthError(error)
    })
  if (!token?.trim()) throw new CredentialError("OAUTH_ACCESS_TOKEN_REQUIRED")
  return token
}

async function renewGoogleAndroid(
  account: string,
  previousToken?: string,
): Promise<CachedToken> {
  if (previousToken) await googleAuthorization().clearToken(previousToken)
  const accessToken = await authorizeGoogleAndroid(account, false)
  const profile = await readProfile("gdrive", accessToken)
  if (profile.email.toLowerCase() !== account.toLowerCase()) {
    throw new CredentialError("Google account authorization rejected")
  }
  return { accessToken, expiresAt: expiresAt() }
}

async function nativeGoogleAccount(id: string, provider: CloudProvider) {
  return provider === "gdrive" && Platform.OS === "android"
    ? readGoogleAccount(id)
    : null
}

async function readProfile(
  provider: CloudProvider,
  accessToken: string,
): Promise<Pick<CloudAuthResult, "accountId" | "displayName" | "email">> {
  const url =
    provider === "gdrive"
      ? "https://openidconnect.googleapis.com/v1/userinfo"
      : "https://api.dropboxapi.com/2/users/get_current_account"
  let response: Response
  try {
    response = await fetch(url, {
      method: provider === "dropbox" ? "POST" : "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    })
  } catch (error) {
    throw new NetworkError("Cloud profile request unavailable", undefined, {
      cause: error,
    })
  }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new CredentialError("Cloud profile authorization rejected")
    }
    throw new NetworkError(
      `Cloud profile request failed: ${response.status}`,
      response.status,
    )
  }
  const profile = (await response.json()) as Record<string, unknown>
  const normalized =
    provider === "gdrive"
      ? {
          accountId: stringValue(profile.sub),
          displayName: stringValue(profile.name),
          email: stringValue(profile.email),
        }
      : {
          accountId: stringValue(profile.account_id),
          displayName: nestedStringValue(profile.name, "display_name"),
          email: stringValue(profile.email),
        }
  if (!normalized.accountId) {
    throw new CredentialError("Cloud profile account ID missing")
  }
  return normalized
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : ""
}

function nestedStringValue(value: unknown, key: string): string {
  if (typeof value !== "object" || value === null) return ""
  return stringValue((value as Record<string, unknown>)[key])
}

function cacheKey(
  dataSourceId: string,
  provider: CloudProvider,
  clientId?: string,
) {
  return `${provider}:${clientIdForRefresh(provider, clientId)}:${dataSourceId}`
}

function normalizeAuthError(error: unknown): unknown {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String(error.code)
      : ""
  if (
    [
      "invalid_grant",
      "invalid_client",
      "access_denied",
      "authentication_failed",
      "authorization_required",
    ].includes(code)
  ) {
    return new CredentialError("Cloud authorization rejected", {
      cause: error,
    })
  }
  if (
    ["network_error", "server_error", "temporarily_unavailable"].includes(code)
  ) {
    return new NetworkError("Cloud authorization unavailable", undefined, {
      cause: error,
    })
  }
  if (
    [
      "configuration_error",
      "service_configuration_error",
      "invalid_scope",
      "invalid_redirect_uri",
    ].includes(code)
  ) {
    return new SyncConfigError("Cloud authorization configuration invalid", {
      cause: error,
    })
  }
  return error
}
