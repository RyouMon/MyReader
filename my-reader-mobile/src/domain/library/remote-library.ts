import { createRemoteBackend } from "../../services/remote/factory";
import type { BookItem, DataSource, Library } from "../types";
import { resolveCoverUri } from "./locations";
import { createLibraryFromPath, forceRefreshMetadata, readBooks } from "./remote-library-shared";

// -- Types (kept here for backward compat) --

export type RemoteDirEntry = {
  name: string;
  path: string;
  isDirectory: boolean;
};

export type RemoteLibraryOps = {
  testConnection(): Promise<Response>;
  listDirectory(path: string): Promise<RemoteDirEntry[]>;
  createLibraryFromPath(remotePath: string): Promise<Library>;
  readBooks(library: Library): Promise<{ books: BookItem[]; metadataUri: string }>;
  buildCoverUri(library: Library, bookPath: string, hasCover: boolean): BookItem["coverUri"];
  forceRefreshMetadata(library: Library): Promise<string>;
};

export function normalizeCurrentPath(path: string | undefined) {
  const normalized = (path ?? "").trim();
  if (!normalized || normalized === "/") return "/";
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

export function isMissingMetadataDbError(error: unknown) {
  return error instanceof Error && /404/.test(error.message);
}

// -- Factory --

export async function createRemoteOps(
  library: Library,
  dataSources: DataSource[],
): Promise<RemoteLibraryOps | null> {
  const source = dataSources.find(
    (d) => d.id === library.dataSourceId && (d.type === "webdav" || d.type === "onedrive"),
  );
  if (!source) return null;

  const backend = await createRemoteBackend(source, library);
  if (!backend) return null;

  return {
    testConnection: async () => {
      const headers = await backend.getAuthHeaders();
      return fetch(backend.contentUrl("/"), { method: "HEAD", headers });
    },
    listDirectory: (path: string) => backend.listDirectory(path),
    createLibraryFromPath: (remotePath: string) => createLibraryFromPath(backend, source.id, source.name, remotePath),
    readBooks: (lib: Library) =>
      readBooks(lib, backend, (l, bookPath, hasCover) =>
        resolveCoverUri(l, bookPath, hasCover, backend),
      ),
    buildCoverUri: (lib: Library, bookPath: string, hasCover: boolean) =>
      resolveCoverUri(lib, bookPath, hasCover, backend),
    forceRefreshMetadata: (lib: Library) => forceRefreshMetadata(lib, backend),
  };
}