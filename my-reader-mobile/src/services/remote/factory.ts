import type { DataSource, DataSourceWebdav } from "@my-reader/tools/types/data-source";
import type { Library } from "@my-reader/tools/types/library";
import type { RemoteBackend } from "./backend";
import { readWebDavPassword, readOneDriveRefreshToken } from "../storage/credentials";

import { OneDriveRemoteBackend } from "./onedrive/backend";
import { WebDavRemoteBackend } from "./webdav/backend";

type WebDavDataSource = DataSourceWebdav & { password: string };

export async function createRemoteBackend(
  dataSource: DataSource,
  library: Library,
): Promise<RemoteBackend | null> {
  const libraryPath = library.sourcePath ?? library.path ?? "";

  if (dataSource.type === "onedrive") {
    const refreshToken = await readOneDriveRefreshToken(dataSource.id);
    if (!refreshToken) return null;
    return new OneDriveRemoteBackend(dataSource.id, libraryPath);
  }

  if (dataSource.type === "webdav") {
    const password = (await readWebDavPassword(dataSource.id)) ?? "";
    if (!password) return null;
    const source: WebDavDataSource = { ...dataSource, password };
    return new WebDavRemoteBackend(source, libraryPath);
  }

  return null;
}
