import * as SecureStore from "expo-secure-store"

import type {
  DataSource,
  DataSourceDropbox,
  DataSourceGdrive,
  DataSourceOnedrive,
  DataSourceType,
  DataSourceWebdav,
} from "@my-reader/tools/types/data-source"

import {
  ONEDRIVE_ACCESS_TOKEN_KEY,
  ONEDRIVE_REFRESH_TOKEN_KEY,
} from "../../constants/onedrive"

const WEB_DAV_PASSWORD_KEY_PREFIX = "ryoumon.myreader.webdav.password."
const TTS_CREDENTIAL_KEY_PREFIX = "ryoumon.myreader.tts."
const CLOUD_REFRESH_TOKEN_KEY_PREFIX = "ryoumon.myreader.cloud.refresh."
const CLOUD_ACCESS_TOKEN_KEY_PREFIX = "ryoumon.myreader.cloud.access."
const GOOGLE_ACCOUNT_KEY_PREFIX = "ryoumon.myreader.google.account."
const S3_CREDENTIAL_KEY_PREFIX = "ryoumon.myreader.s3."

/**
 * 为指定 WebDAV 数据源生成凭证键。
 */
function buildWebDavPasswordKey(dataSourceId: string) {
  return `${WEB_DAV_PASSWORD_KEY_PREFIX}${dataSourceId}`
}

/**
 * 读取 WebDAV 密码；不存在时返回 null。
 */
export async function readWebDavPassword(
  dataSourceId: string,
): Promise<string | null> {
  if (!dataSourceId) {
    return null
  }
  return SecureStore.getItemAsync(buildWebDavPasswordKey(dataSourceId))
}

/**
 * 写入 WebDAV 密码；空密码会删除已存凭证。
 */
export async function writeWebDavPassword(
  dataSourceId: string,
  password: string,
): Promise<void> {
  if (!dataSourceId) {
    return
  }

  if (!password) {
    await SecureStore.deleteItemAsync(buildWebDavPasswordKey(dataSourceId))
    return
  }

  await SecureStore.setItemAsync(buildWebDavPasswordKey(dataSourceId), password)
}

/**
 * 删除 WebDAV 密码。
 */
export async function deleteWebDavPassword(
  dataSourceId: string,
): Promise<void> {
  if (!dataSourceId) {
    return
  }
  await SecureStore.deleteItemAsync(buildWebDavPasswordKey(dataSourceId))
}

// OneDrive tokens

export async function readOneDriveAccessToken(
  id: string,
): Promise<string | null> {
  if (!id) return null
  return SecureStore.getItemAsync(`${ONEDRIVE_ACCESS_TOKEN_KEY}.${id}`)
}

export async function writeOneDriveAccessToken(
  id: string,
  token: string,
): Promise<void> {
  if (!id) return
  await SecureStore.setItemAsync(`${ONEDRIVE_ACCESS_TOKEN_KEY}.${id}`, token)
}

export async function deleteOneDriveAccessToken(id: string): Promise<void> {
  if (!id) return
  await SecureStore.deleteItemAsync(`${ONEDRIVE_ACCESS_TOKEN_KEY}.${id}`)
}

export async function readOneDriveRefreshToken(
  id: string,
): Promise<string | null> {
  if (!id) return null
  return SecureStore.getItemAsync(`${ONEDRIVE_REFRESH_TOKEN_KEY}.${id}`)
}

export async function writeOneDriveRefreshToken(
  id: string,
  token: string,
): Promise<void> {
  if (!id) return
  await SecureStore.setItemAsync(`${ONEDRIVE_REFRESH_TOKEN_KEY}.${id}`, token)
}

export async function deleteOneDriveRefreshToken(id: string): Promise<void> {
  if (!id) return
  await SecureStore.deleteItemAsync(`${ONEDRIVE_REFRESH_TOKEN_KEY}.${id}`)
}

function cloudKey(prefix: string, id: string) {
  return `${prefix}${id}`
}

export async function readCloudRefreshToken(
  id: string,
): Promise<string | null> {
  return id
    ? SecureStore.getItemAsync(cloudKey(CLOUD_REFRESH_TOKEN_KEY_PREFIX, id))
    : null
}
export async function writeCloudRefreshToken(
  id: string,
  token: string,
): Promise<void> {
  if (id)
    await SecureStore.setItemAsync(
      cloudKey(CLOUD_REFRESH_TOKEN_KEY_PREFIX, id),
      token,
    )
}
export async function deleteCloudRefreshToken(id: string): Promise<void> {
  if (id)
    await SecureStore.deleteItemAsync(
      cloudKey(CLOUD_REFRESH_TOKEN_KEY_PREFIX, id),
    )
}

// Android's Google Identity SDK owns token renewal. Keep the selected account
// bound to this source, rather than storing a fabricated refresh token.
export async function readGoogleAccount(id: string): Promise<string | null> {
  return id
    ? SecureStore.getItemAsync(cloudKey(GOOGLE_ACCOUNT_KEY_PREFIX, id))
    : null
}

async function writeGoogleAccount(id: string, account?: string): Promise<void> {
  if (!id) return
  const key = cloudKey(GOOGLE_ACCOUNT_KEY_PREFIX, id)
  if (account) await SecureStore.setItemAsync(key, account)
  else await SecureStore.deleteItemAsync(key)
}

export type CloudAccessToken = { accessToken: string; expiresAt: number }

export async function readCloudAccessToken(
  id: string,
): Promise<CloudAccessToken | null> {
  if (!id) return null
  const raw = await SecureStore.getItemAsync(
    cloudKey(CLOUD_ACCESS_TOKEN_KEY_PREFIX, id),
  )
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as Partial<CloudAccessToken>
    if (
      typeof value.accessToken !== "string" ||
      typeof value.expiresAt !== "number"
    ) {
      return null
    }
    return value as CloudAccessToken
  } catch {
    return null
  }
}

export async function writeCloudAccessToken(
  id: string,
  value: CloudAccessToken,
): Promise<void> {
  if (!id) return
  await SecureStore.setItemAsync(
    cloudKey(CLOUD_ACCESS_TOKEN_KEY_PREFIX, id),
    JSON.stringify(value),
  )
}

export async function deleteCloudAccessToken(id: string): Promise<void> {
  if (id)
    await SecureStore.deleteItemAsync(
      cloudKey(CLOUD_ACCESS_TOKEN_KEY_PREFIX, id),
    )
}

export type S3Credentials = {
  accessKeyId: string
  secretAccessKey: string
  sessionToken?: string
}
export async function readS3Credentials(
  id: string,
): Promise<S3Credentials | null> {
  if (!id) return null
  const raw = await SecureStore.getItemAsync(
    cloudKey(S3_CREDENTIAL_KEY_PREFIX, id),
  )
  if (!raw) return null
  try {
    return JSON.parse(raw) as S3Credentials
  } catch {
    return null
  }
}
export async function writeS3Credentials(
  id: string,
  value: S3Credentials,
): Promise<void> {
  if (id)
    await SecureStore.setItemAsync(
      cloudKey(S3_CREDENTIAL_KEY_PREFIX, id),
      JSON.stringify(value),
    )
}
export async function deleteS3Credentials(id: string): Promise<void> {
  if (id)
    await SecureStore.deleteItemAsync(cloudKey(S3_CREDENTIAL_KEY_PREFIX, id))
}

/**
 * Hydrate data sources from secure storage, filling in passwords/tokens.
 */
export async function hydrateDataSourcesFromSecureCredentials(
  dataSources: DataSource[],
): Promise<DataSource[]> {
  const hydrated: DataSource[] = []

  for (const source of dataSources) {
    if (source.type === "webdav") {
      const securePassword = await readWebDavPassword(source.id)
      const withPassword: DataSourceWebdav = {
        ...source,
        hasPassword: Boolean(securePassword),
      }
      hydrated.push(withPassword)
    } else if (source.type === "onedrive") {
      const refreshToken = await readOneDriveRefreshToken(source.id)
      const withToken: DataSourceOnedrive = {
        ...source,
        hasRefreshToken: Boolean(refreshToken),
      }
      hydrated.push(withToken)
    } else if (source.type === "gdrive" || source.type === "dropbox") {
      const refreshToken = await readCloudRefreshToken(source.id)
      const googleAccount =
        source.type === "gdrive" ? await readGoogleAccount(source.id) : null
      const withToken: DataSourceGdrive | DataSourceDropbox = {
        ...source,
        // Preserve the shared DTO's renewable-credential flag for native grants.
        hasRefreshToken: Boolean(refreshToken || googleAccount),
      }
      hydrated.push(withToken)
    } else if (source.type === "s3") {
      hydrated.push({
        ...source,
        hasCredentials: Boolean(await readS3Credentials(source.id)),
      })
    } else {
      hydrated.push(source)
    }
  }

  return hydrated
}

// --- Secrets helpers (used by useDataSourceActions) ---

export type DataSourceSecrets =
  | { type: "webdav"; password: string }
  | { type: "onedrive"; accessToken: string; refreshToken?: string }
  | {
      type: "gdrive" | "dropbox"
      accessToken: string
      refreshToken: string
      accessTokenExpiresAt?: number
      googleAccount?: string
    }
  | ({ type: "s3" } & S3Credentials)

export async function writeSecrets(
  id: string,
  secrets: DataSourceSecrets,
): Promise<void> {
  switch (secrets.type) {
    case "webdav":
      await writeWebDavPassword(id, secrets.password)
      break
    case "onedrive":
      await writeOneDriveAccessToken(id, secrets.accessToken)
      if (secrets.refreshToken) {
        await writeOneDriveRefreshToken(id, secrets.refreshToken)
      }
      break
    case "gdrive":
    case "dropbox":
      if (secrets.type === "gdrive") {
        await writeGoogleAccount(id, secrets.googleAccount)
      }
      if (secrets.refreshToken) {
        await writeCloudRefreshToken(id, secrets.refreshToken)
      } else {
        await deleteCloudRefreshToken(id)
      }
      if (secrets.accessToken) {
        await writeCloudAccessToken(id, {
          accessToken: secrets.accessToken,
          expiresAt:
            secrets.accessTokenExpiresAt ?? Date.now() + 50 * 60 * 1000,
        })
      }
      break
    case "s3":
      await writeS3Credentials(id, {
        accessKeyId: secrets.accessKeyId,
        secretAccessKey: secrets.secretAccessKey,
        sessionToken: secrets.sessionToken,
      })
      break
  }
}

export async function deleteSecrets(
  id: string,
  type: DataSourceType,
): Promise<void> {
  switch (type) {
    case "webdav":
      await deleteWebDavPassword(id)
      break
    case "onedrive":
      await deleteOneDriveAccessToken(id)
      await deleteOneDriveRefreshToken(id)
      break
    case "gdrive":
    case "dropbox":
      if (type === "gdrive") await writeGoogleAccount(id)
      await deleteCloudRefreshToken(id)
      await deleteCloudAccessToken(id)
      break
    case "s3":
      await deleteS3Credentials(id)
      break
  }
}

export function deriveCredentialFlags(
  secrets?: DataSourceSecrets,
): Record<string, boolean> {
  if (!secrets) return {}
  switch (secrets.type) {
    case "webdav":
      return { hasPassword: Boolean(secrets.password) }
    case "onedrive":
      return { hasRefreshToken: Boolean(secrets.refreshToken) }
    case "gdrive":
    case "dropbox":
      return {
        hasRefreshToken: Boolean(secrets.refreshToken || secrets.googleAccount),
      }
    case "s3":
      return {
        hasCredentials: Boolean(secrets.accessKeyId && secrets.secretAccessKey),
      }
  }
}

export function ttsCredentialReference(profileId: string): string {
  return `${TTS_CREDENTIAL_KEY_PREFIX}${profileId}`
}

export async function readTtsCredential(
  reference: string,
): Promise<string | null> {
  if (!reference) return null
  return SecureStore.getItemAsync(reference)
}

export async function writeTtsCredential(
  reference: string,
  credential: string,
): Promise<void> {
  if (!reference) return
  const value = credential.trim()
  if (!value) {
    await SecureStore.deleteItemAsync(reference)
    return
  }
  await SecureStore.setItemAsync(reference, value)
}

export async function deleteTtsCredential(reference: string): Promise<void> {
  if (!reference) return
  await SecureStore.deleteItemAsync(reference)
}
