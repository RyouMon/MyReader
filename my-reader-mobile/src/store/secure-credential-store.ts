import * as SecureStore from "expo-secure-store";

import type { DataSource, DataSourceWebdav } from "../data/types";

const WEB_DAV_PASSWORD_KEY_PREFIX = "ryoumon.myreader.webdav.password.";

/**
 * 为指定 WebDAV 数据源生成凭证键。
 */
function buildWebDavPasswordKey(dataSourceId: string) {
  return `${WEB_DAV_PASSWORD_KEY_PREFIX}${dataSourceId}`;
}

/**
 * 读取 WebDAV 密码；不存在时返回 null。
 */
export async function readWebDavPassword(dataSourceId: string): Promise<string | null> {
  if (!dataSourceId) {
    return null;
  }
  return SecureStore.getItemAsync(buildWebDavPasswordKey(dataSourceId));
}

/**
 * 写入 WebDAV 密码；空密码会删除已存凭证。
 */
export async function writeWebDavPassword(dataSourceId: string, password: string): Promise<void> {
  if (!dataSourceId) {
    return;
  }

  if (!password) {
    await SecureStore.deleteItemAsync(buildWebDavPasswordKey(dataSourceId));
    return;
  }

  await SecureStore.setItemAsync(buildWebDavPasswordKey(dataSourceId), password);
}

/**
 * 删除 WebDAV 密码。
 */
export async function deleteWebDavPassword(dataSourceId: string): Promise<void> {
  if (!dataSourceId) {
    return;
  }
  await SecureStore.deleteItemAsync(buildWebDavPasswordKey(dataSourceId));
}

/**
 * 依据安全存储回填数据源密码，并返回可在内存中使用的列表副本。
 */
export async function hydrateDataSourcesFromSecureCredentials(
  dataSources: DataSource[]
): Promise<DataSource[]> {
  const hydrated: DataSource[] = [];

  for (const source of dataSources) {
    const securePassword = await readWebDavPassword(source.id);
    const withPassword: DataSourceWebdav = {
      ...source,
      password: securePassword ?? undefined,
      hasPassword: Boolean(securePassword),
    };
    hydrated.push(withPassword);
  }

  return hydrated;
}

/**
 * 序列化前剥离敏感字段，避免密码落入普通 JSON 存储。
 */
export function stripSensitiveDataSources(dataSources: DataSource[]): DataSource[] {
  return dataSources.map((source) => {
    const { password, ...rest } = source;
    return {
      ...rest,
      hasPassword: rest.hasPassword || Boolean(password),
    } satisfies DataSourceWebdav;
  });
}
