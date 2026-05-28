import type { DataSource, Library, WebDavDataSource } from "../../domain/types";
import type { RemoteBackend } from "./backend";
import { readWebDavPassword, readOneDriveRefreshToken } from "../storage/credentials";

import { OneDriveRemoteBackend } from "./onedrive/backend";
import { WebDavRemoteBackend } from "./webdav/backend";

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