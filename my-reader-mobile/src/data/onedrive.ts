import { File, Paths } from "expo-file-system";
import ky from "ky";

import { GRAPH_API_BASE } from "../constants/onedrive";
import { getValidAccessToken, refreshAccessToken } from "../services/auth/onedrive";
import type { RemoteDirEntry, RemoteLibraryOps } from "./remote-library";
import type { RemoteBackendAdapter } from "./remote-library-shared";
import { createLibraryFromPath, readBooks, forceRefreshMetadata as sharedForceRefresh } from "./remote-library-shared";
import type { BookItem, Library, OneDriveDataSource } from "./types";

// -- Auth helpers --

async function authHeaders(dataSourceId: string): Promise<Record<string, string>> {
  const token = await getValidAccessToken(dataSourceId);
  return { Authorization: `Bearer ${token}` };
}

// -- Graph API helpers --

async function graphGet(dataSourceId: string, path: string): Promise<Response> {
  return ky(`${GRAPH_API_BASE}${path}`, {
    headers: await authHeaders(dataSourceId),
    throwHttpErrors: false,
  });
}

async function graphGetJson<T>(dataSourceId: string, path: string): Promise<T> {
  const res = await graphGet(dataSourceId, path);
  if (res.status === 401) {
    await refreshAccessToken(dataSourceId);
    const retryRes = await ky(`${GRAPH_API_BASE}${path}`, {
      headers: await authHeaders(dataSourceId),
      throwHttpErrors: false,
    });
    return (await retryRes.json()) as T;
  }
  return (await res.json()) as T;
}

// -- OneDrive types --

type DriveItem = {
  id: string;
  name: string;
  size?: number;
  lastModifiedDateTime?: string;
  file?: { mimeType: string };
  folder?: { childCount: number };
  deleted?: object;
  parentReference?: { path: string };
};

type DriveChildrenResponse = {
  value: DriveItem[];
  "@odata.nextLink"?: string;
};

// -- Adapter --

function onedriveAdapter(source: OneDriveDataSource): RemoteBackendAdapter {
  return {
    cacheKeyPrefix: "onedrive",
    sourceType: "onedrive",
    normalizePath: (path) => path.startsWith("/") ? path : `/${path}`,
    downloadToCache: (remotePath, localName) => downloadToCache(source.id, remotePath, localName),
    buildCoverUri: (library, bookPath, hasCover) => buildCoverUri(library, source, bookPath, hasCover),
  };
}

// -- Public ops factory --

export function createOneDriveOps(source: OneDriveDataSource): RemoteLibraryOps {
  const adapter = onedriveAdapter(source);
  return {
    testConnection: () => testConnection(source.id),
    listDirectory: (path) => listDirectory(source, path),
    createLibraryFromPath: (remotePath) => createLibraryFromPath(adapter, source.id, source.name, remotePath),
    readBooks: (library) => readBooks(library, adapter),
    buildCoverUri: (library, bookPath, hasCover) => buildCoverUri(library, source, bookPath, hasCover),
    forceRefreshMetadata: (library) => sharedForceRefresh(library, adapter),
  };
}

// -- Standalone exports (used by external callers until migration complete) --

export async function testConnection(dataSourceId: string): Promise<Response> {
  return graphGet(dataSourceId, "/me/drive/root");
}

async function listDirectory(
  source: OneDriveDataSource,
  path = "",
): Promise<RemoteDirEntry[]> {
  const encodedPath = encodeURI(path.startsWith("/") ? path : `/${path}`);
  const endpoint = encodedPath === "/"
    ? "/me/drive/root/children"
    : `/me/drive/root:${encodedPath}:/children`;

  let allItems: DriveItem[] = [];
  let nextUrl: string | undefined = endpoint;

  while (nextUrl) {
    const data: DriveChildrenResponse = await graphGetJson<DriveChildrenResponse>(source.id, nextUrl.replace(GRAPH_API_BASE, ""));
    allItems = allItems.concat(data.value ?? []);
    nextUrl = data["@odata.nextLink"];
  }

  return allItems
    .filter((item) => item.folder && !item.deleted)
    .map((item) => {
      const parentPath = item.parentReference?.path ?? "";
      const relativeParent = parentPath.replace(/^\/drive\/root:/, "");
      const fullPath = relativeParent ? `${relativeParent}/${item.name}` : item.name;

      return {
        name: item.name,
        path: fullPath,
        isDirectory: true,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
}

async function downloadToCache(dataSourceId: string, remotePath: string, localName: string) {
  const headers = await authHeaders(dataSourceId);
  const encodedPath = encodeURI(remotePath.startsWith("/") ? remotePath : `/${remotePath}`);
  const url = `${GRAPH_API_BASE}/me/drive/root:${encodedPath}:/content`;

  const response = await ky(url, { headers });
  const bytes = new Uint8Array(await response.arrayBuffer());
  const file = new File(Paths.cache, localName);

  if (!file.exists) {
    file.create({ intermediates: true, overwrite: true });
  }

  file.write(bytes);
  return file;
}

export async function buildCoverUri(
  library: Library,
  source: OneDriveDataSource,
  bookPath: string,
  hasCover: boolean,
): Promise<BookItem["coverUri"]> {
  if (!bookPath || !hasCover) return undefined;

  const remoteCoverPath = `${library.sourcePath ?? library.path}/${bookPath}/cover.jpg`;
  const encodedPath = encodeURI(remoteCoverPath.startsWith("/") ? remoteCoverPath : `/${remoteCoverPath}`);
  const contentUrl = `${GRAPH_API_BASE}/me/drive/root:${encodedPath}:/content`;
  const headers = await authHeaders(source.id);

  return {
    uri: contentUrl,
    headers,
  };
}
