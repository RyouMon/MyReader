import { File, Paths } from "expo-file-system";
import ky from "ky";

import i18n from "@/src/i18n";

import { showAlertWithStatusBarRestore } from "../constants/alert-with-status-bar";
import { GRAPH_API_BASE } from "../constants/onedrive";
import { openDatabaseFromUri } from "./sqlite";
import type { BookItem, Library, OneDriveDataSource } from "./types";
import type { RemoteDirEntry, RemoteLibraryOps } from "./remote-library";
import { getValidAccessToken } from "./onedrive-auth";

export function createOneDriveOps(source: OneDriveDataSource): RemoteLibraryOps {
  return {
    testConnection: () => testConnection(source.id),
    listDirectory: (path) => listDirectory(source, path),
    createLibraryFromPath: (remotePath) => createLibraryFromPath(source, remotePath),
    readBooks: (library) => readBooks(library, source),
    buildCoverUri: (library, bookPath, hasCover) => buildCoverUri(library, source, bookPath, hasCover),
    forceRefreshMetadata: (library) => forceRefreshMetadata(library, source),
  };
}

async function authHeaders(dataSourceId: string): Promise<Record<string, string>> {
  const token = await getValidAccessToken(dataSourceId);
  return { Authorization: `Bearer ${token}` };
}

async function graphGet(dataSourceId: string, path: string): Promise<Response> {
  return ky(`${GRAPH_API_BASE}${path}`, {
    headers: await authHeaders(dataSourceId),
    throwHttpErrors: false,
  });
}

async function graphGetJson<T>(dataSourceId: string, path: string): Promise<T> {
  const res = await graphGet(dataSourceId, path);
  if (res.status === 401) {
    // Token was stale; refreshAccessToken is called on 401 by getValidAccessToken,
    // but ky doesn't retry automatically. Force a refresh and retry once.
    const { refreshAccessToken } = await import("./onedrive-auth");
    await refreshAccessToken(dataSourceId);
    const retryRes = await ky(`${GRAPH_API_BASE}${path}`, {
      headers: await authHeaders(dataSourceId),
      throwHttpErrors: false,
    });
    return (await retryRes.json()) as T;
  }
  return (await res.json()) as T;
}

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

export async function testConnection(dataSourceId: string): Promise<Response> {
  return graphGet(dataSourceId, "/me/drive/root");
}

export async function listDirectory(
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
      // parentReference.path format: "/drive/root:/Documents/Calibre"
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

type RawBookRow = {
  id: number;
  title: string | null;
  author_sort: string | null;
  authors: string | null;
  path: string | null;
  has_cover: number | null;
  timestamp: string | null;
};

const BOOKS_QUERY = `
  SELECT
    b.id,
    b.title,
    b.author_sort,
    b.path,
    b.has_cover,
    b.timestamp,
    (
      SELECT GROUP_CONCAT(a.name, '||')
      FROM authors a
      JOIN books_authors_link bal ON a.id = bal.author
      WHERE bal.book = b.id
    ) AS authors
  FROM books b
  ORDER BY b.sort COLLATE NOCASE ASC
`;

function splitConcat(value: string | null) {
  return value ? value.split("||").filter(Boolean) : [];
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

async function ensureMetadataCached(
  library: Library,
  source: OneDriveDataSource,
): Promise<string | null> {
  const existingMetadata = new File(library.metadataUri!);
  if (existingMetadata.exists) {
    return existingMetadata.uri;
  }

  try {
    const remoteBase = library.sourcePath ?? library.path;
    const metadataFile = await downloadToCache(
      source.id,
      `${remoteBase}/metadata.db`,
      `onedrive-${library.id}-metadata.db`,
    );
    return metadataFile.uri;
  } catch {
    showAlertWithStatusBarRestore(
      i18n.t("sync.corruptedLibrary"),
      i18n.t("sync.corruptedLibraryMessage"),
      [{ text: i18n.t("common.gotIt") }],
    );
    return null;
  }
}

export async function forceRefreshMetadata(
  library: Library,
  source: OneDriveDataSource,
): Promise<string | null> {
  try {
    const remoteBase = library.sourcePath ?? library.path;
    const metadataFile = await downloadToCache(
      source.id,
      `${remoteBase}/metadata.db`,
      `onedrive-${library.id}-metadata.db`,
    );
    return metadataFile.uri;
  } catch {
    showAlertWithStatusBarRestore(
      i18n.t("sync.corruptedLibrary"),
      i18n.t("sync.corruptedLibraryRedownloadMessage"),
      [{ text: i18n.t("common.gotIt") }],
    );
    return null;
  }
}

export async function createLibraryFromPath(
  source: OneDriveDataSource,
  remoteLibraryPath: string,
): Promise<Library> {
  const metadataFile = await downloadToCache(
    source.id,
    `${remoteLibraryPath}/metadata.db`,
    `onedrive-${source.id}-${Date.now()}-metadata.db`,
  );

  const db = await openDatabaseFromUri(metadataFile.uri);

  try {
    const row = await db.getFirstAsync<{ count: number }>("SELECT COUNT(*) as count FROM books");
    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      name: remoteLibraryPath.split("/").filter(Boolean).at(-1) ?? source.name,
      path: remoteLibraryPath,
      metadataUri: metadataFile.uri,
      bookCount: row ? Number(row.count) : 0,
      addedAt: Date.now(),
      dataSourceId: source.id,
      sourceType: "onedrive",
      sourcePath: remoteLibraryPath,
    };
  } finally {
    await db.closeAsync();
  }
}

export async function readBooks(
  library: Library,
  source: OneDriveDataSource,
): Promise<{ books: BookItem[]; metadataUri: string }> {
  const metadataUri = await ensureMetadataCached(library, source);
  if (!metadataUri) {
    return { books: [], metadataUri: library.metadataUri! };
  }
  const db = await openDatabaseFromUri(metadataUri);

  try {
    const rows = await db.getAllAsync<RawBookRow>(BOOKS_QUERY);

    return {
      metadataUri,
      books: rows.map((row) => {
        const authors = splitConcat(row.authors);
        const remoteCoverPath =
          row.path && (row.has_cover ?? 0) !== 0
            ? `${library.sourcePath ?? library.path}/${row.path}/cover.jpg`
            : undefined;

        return {
          id: `${row.id}`,
          calibreId: row.id,
          title: row.title || i18n.t("common.unnamedBook"),
          author: authors[0] || row.author_sort || i18n.t("common.unknownAuthor"),
          authors,
          path: row.path || undefined,
          hasCover: (row.has_cover ?? 0) !== 0,
          timestamp: row.timestamp,
          coverUri: remoteCoverPath ? buildCoverUri(library, source, remoteCoverPath, true) : undefined,
        } satisfies BookItem;
      }),
    };
  } finally {
    await db.closeAsync();
  }
}

export function buildCoverUri(
  library: Library,
  source: OneDriveDataSource,
  bookPath: string,
  hasCover: boolean,
): BookItem["coverUri"] {
  if (!bookPath || !hasCover) return undefined;

  const encodedPath = encodeURI(bookPath.startsWith("/") ? bookPath : `/${bookPath}`);
  const contentUrl = `${GRAPH_API_BASE}/me/drive/root:${encodedPath}:/content`;

  return {
    uri: contentUrl,
    headers: { Authorization: `Bearer ${source.accessToken}` },
  };
}