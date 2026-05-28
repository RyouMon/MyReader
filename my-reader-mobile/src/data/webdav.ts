import { createRemoteBackend } from "../remote/factory";
import { WebDavUrlBuilder } from "../services/webdav/url-builder";
import type { BookItem, Library, WebDavDataSource } from "./types";
import {
  readBooks,
  forceRefreshMetadata,
  createLibraryFromPath,
} from "./remote-library-shared";
import { hasLocalCover, localCoverPath } from "../remote/cover-mirror";

export type WebDavOps = {
  testConnection(timeout?: number | false): Promise<Response>;
  listDirectory(path: string): Promise<import("./remote-library").RemoteDirEntry[]>;
  createLibraryFromPath(remotePath: string): Promise<Library>;
  readBooks(library: Library): Promise<{ books: BookItem[]; metadataUri: string }>;
  buildCoverUri(library: Library, bookPath: string, hasCover: boolean): BookItem["coverUri"];
  forceRefreshMetadata(library: Library): Promise<string | null>;
};

export async function createWebDavOps(
  dataSource: WebDavDataSource,
  library: Library,
): Promise<WebDavOps> {
  const backend = await createRemoteBackend(dataSource, library);
  if (!backend) throw new Error("Failed to create WebDAV backend");

  return {
    testConnection: async () => {
      const urlBuilder = new WebDavUrlBuilder(dataSource);
      const response = await fetch(urlBuilder.urlFor(""), {
        method: "PROPFIND",
        headers: { ...urlBuilder.authHeaders, Depth: "0" },
      });
      return response;
    },
    listDirectory: (path: string) => backend.listDirectory(path),
    createLibraryFromPath: (remotePath: string) => createLibraryFromPath(backend, dataSource.id, dataSource.name, remotePath),
    readBooks: (lib: Library) => readBooks(lib, backend, (l, bookPath, hasCover) =>
      buildWebDavCoverUri(l, backend, bookPath, hasCover),
    ),
    buildCoverUri: (lib: Library, bookPath: string, hasCover: boolean) =>
      buildWebDavCoverUri(lib, backend, bookPath, hasCover),
    forceRefreshMetadata: (lib: Library) => forceRefreshMetadata(lib, backend),
  };
}

function buildWebDavCoverUri(
  library: Library,
  backend: import("../remote/backend").RemoteBackend,
  bookPath: string,
  hasCover: boolean,
): BookItem["coverUri"] {
  if (!bookPath || !hasCover) return undefined;

  if (hasLocalCover(library.id, bookPath)) {
    return localCoverPath(library.id, bookPath);
  }

  const remoteCoverPath = `${library.sourcePath ?? library.path}/${bookPath}/cover.jpg`;
  const cachedHeaders = backend.getCachedAuthHeaders();

  return {
    uri: backend.contentUrl(remoteCoverPath),
    headers: cachedHeaders ?? undefined,
  };
}

export async function testConnection(source: WebDavDataSource): Promise<Response> {
  const urlBuilder = new WebDavUrlBuilder(source);
  const response = await fetch(urlBuilder.urlFor(""), {
    method: "PROPFIND",
    headers: { ...urlBuilder.authHeaders, Depth: "0" },
  });
  return response;
}
