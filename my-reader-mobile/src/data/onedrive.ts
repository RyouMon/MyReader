import { GRAPH_API_BASE } from "../constants/onedrive";
import { getValidAccessToken } from "../services/auth/onedrive";
import { createRemoteBackend } from "../remote/factory";
import type { DataSourceOnedrive, Library } from "./types";
import type { BookItem } from "./types";
import {
  readBooks,
  forceRefreshMetadata,
  createLibraryFromPath,
} from "./remote-library-shared";

export type OneDriveOps = {
  testConnection(): Promise<Response>;
  listDirectory(path: string): Promise<import("./remote-library").RemoteDirEntry[]>;
  createLibraryFromPath(remotePath: string): Promise<Library>;
  readBooks(library: Library): Promise<{ books: BookItem[]; metadataUri: string }>;
  buildCoverUri(library: Library, bookPath: string, hasCover: boolean): Promise<BookItem["coverUri"]>;
  forceRefreshMetadata(library: Library): Promise<string | null>;
};

export async function createOneDriveOps(
  dataSource: DataSourceOnedrive,
  library: Library,
): Promise<OneDriveOps> {
  const backend = await createRemoteBackend(dataSource, library);
  if (!backend) throw new Error("Failed to create OneDrive backend");

  return {
    testConnection: async () => {
      const headers = await backend.getAuthHeaders();
      return fetch(`${GRAPH_API_BASE}/me/drive`, { method: "GET", headers });
    },
    listDirectory: (path: string) => backend.listDirectory(path),
    createLibraryFromPath: (remotePath: string) => createLibraryFromPath(backend, dataSource.id, dataSource.name, remotePath),
    readBooks: (lib: Library) => readBooks(lib, backend, (l, bookPath, hasCover) =>
      buildOneDriveCoverUri(l, backend, bookPath, hasCover),
    ),
    buildCoverUri: (lib: Library, bookPath: string, hasCover: boolean) =>
      buildOneDriveCoverUri(lib, backend, bookPath, hasCover),
    forceRefreshMetadata: (lib: Library) => forceRefreshMetadata(lib, backend),
  };
}

async function buildOneDriveCoverUri(
  library: Library,
  backend: import("../remote/backend").RemoteBackend,
  bookPath: string,
  hasCover: boolean,
): Promise<BookItem["coverUri"]> {
  if (!bookPath || !hasCover) return undefined;

  const remoteCoverPath = `${library.sourcePath ?? library.path}/${bookPath}/cover.jpg`;
  const cachedHeaders = backend.getCachedAuthHeaders();

  return {
    uri: backend.contentUrl(remoteCoverPath),
    headers: cachedHeaders ?? undefined,
  };
}

export async function refreshOneDriveToken(
  dataSourceId: string,
): Promise<{ accessToken: string; expiresAt: number }> {
  return getValidAccessToken(dataSourceId);
}
