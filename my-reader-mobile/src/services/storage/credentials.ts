import * as SecureStore from "expo-secure-store"

import type {
  DataSource,
  DataSourceOnedrive,
  DataSourceType,
  DataSourceWebdav,
} from "@my-reader/tools/types/data-source"

import {
  ONEDRIVE_ACCESS_TOKEN_KEY,
  ONEDRIVE_REFRESH_TOKEN_KEY,
} from "../../constants/onedrive"

const WEB_DAV_PASSWORD_KEY_PREFIX = "ryoumon.myreader.webdav.password."

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
  }
}
