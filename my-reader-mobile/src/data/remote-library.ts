import { readWebDavPassword } from "../store/secure-credential-store";
import { createOneDriveOps } from "./onedrive";
import { getValidAccessToken } from "./onedrive-auth";
import type { BookItem, DataSource, Library, OneDriveDataSource, WebDavDataSource } from "./types";
import { createWebDavOps } from "./webdav";

/** Generic operations for a remote Calibre library hosted on a cloud backend. */
export type RemoteLibraryOps = {
  /** Test connectivity to the remote source. */
  testConnection(): Promise<Response>;

  /** List directories under the given path. */
  listDirectory(path: string): Promise<RemoteDirEntry[]>;

  /** Download metadata.db, open it, read book count, return a Library object. */
  createLibraryFromPath(remotePath: string): Promise<Library>;

  /** Ensure metadata.db is cached, read books from it, return book items + metadata URI. */
  readBooks(library: Library): Promise<{ books: BookItem[]; metadataUri: string }>;

  /** Build a cover image URI (with auth headers if needed) for a book. */
  buildCoverUri(library: Library, bookPath: string, hasCover: boolean): Promise<BookItem["coverUri"]>;

  /** Force re-download metadata.db and return the new URI. */
  forceRefreshMetadata(library: Library): Promise<string | null>;
};

export function normalizeCurrentPath(path: string | undefined) {
  const normalized = (path ?? "").trim();
  if (!normalized || normalized === "/") {
    return "/";
  }
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

export function isMissingMetadataDbError(error: unknown) {
  return error instanceof Error && /404/.test(error.message);
}

export type RemoteDirEntry = {
  name: string;
  /** Relative path from the source root. */
  path: string;
  isDirectory: boolean;
};

/** Resolve a RemoteLibraryOps for the given library's data source. */
export async function createRemoteOps(
  library: Library,
  dataSources: DataSource[],
): Promise<RemoteLibraryOps | null> {
  if (library.sourceType === "webdav") {
    const source = dataSources.find(
      (d) => d.id === library.dataSourceId && d.type === "webdav",
    );
    if (!source || source.type !== "webdav") return null;
    const password = source.password ?? (await readWebDavPassword(source.id)) ?? "";
    return createWebDavOps({ ...source, password } satisfies WebDavDataSource);
  }

  if (library.sourceType === "onedrive") {
    const source = dataSources.find(
      (d) => d.id === library.dataSourceId && d.type === "onedrive",
    );
    if (!source || source.type !== "onedrive") return null;
    const accessToken = await getValidAccessToken(source.id);
    return createOneDriveOps({ ...source, accessToken } satisfies OneDriveDataSource);
  }

  return null;
}