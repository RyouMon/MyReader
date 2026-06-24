import { createRemoteBackend } from "../../services/remote/factory";
import type { RemoteBackend } from "../../services/remote/backend";
import type { BookItem, DataSource, Library } from "../types";
import { resolveCoverUri } from "@/src/services/fs/library-paths";
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

function browsePlaceholderLibrary(dataSource: DataSource): Library {
  return {
    id: "browse",
    name: "",
    path: "",
    bookCount: 0,
    dataSourceId: dataSource.id,
    sourceType: dataSource.type,
  };
}

function buildRemoteOps(backend: RemoteBackend, source: DataSource, mode: "library" | "browse"): RemoteLibraryOps {
  const shared = {
    testConnection: async () => {
      const headers = await backend.getAuthHeaders();
      return fetch(backend.contentUrl("/"), { method: "HEAD", headers });
    },
    listDirectory: (path: string) => backend.listDirectory(path),
    createLibraryFromPath: (remotePath: string) =>
      createLibraryFromPath(backend, source.id, source.name, remotePath),
  };

  if (mode === "browse") {
    return {
      ...shared,
      readBooks: async () => ({ books: [], metadataUri: "" }),
      buildCoverUri: () => undefined,
      forceRefreshMetadata: async () => {
        throw new Error("forceRefreshMetadata unavailable in browse mode");
      },
    };
  }

  return {
    ...shared,
    readBooks: (lib: Library) =>
      readBooks(lib, backend, (l, bookPath, hasCover) => resolveCoverUri(l, bookPath, hasCover, backend)),
    buildCoverUri: (lib: Library, bookPath: string, hasCover: boolean) =>
      resolveCoverUri(lib, bookPath, hasCover, backend),
    forceRefreshMetadata: (lib: Library) => forceRefreshMetadata(lib, backend),
  };
}

/** Dev-only mock browse ops for E2E fixture data sources. */
function createFixtureBrowseOps(dataSource: DataSource): RemoteLibraryOps {
  return {
    testConnection: async () => new Response(null, { status: 200 }),
    listDirectory: async (path: string) => {
      const normalized = normalizeCurrentPath(path);
      if (normalized === "/" || normalized === "") {
        return [{ name: "sub", path: "/sub", isDirectory: true }];
      }
      return [];
    },
    createLibraryFromPath: async () => ({
      id: "fixture-lib",
      name: "Fixture Library",
      path: "/",
      bookCount: 0,
      dataSourceId: dataSource.id,
      sourceType: dataSource.type,
    }),
    readBooks: async () => ({ books: [], metadataUri: "" }),
    buildCoverUri: () => undefined,
    forceRefreshMetadata: async () => {
      throw new Error("forceRefreshMetadata unavailable in browse mode");
    },
  };
}

/** Resolves browse-only remote ops for directory picker screens. */
export async function createBrowseRemoteOps(dataSource: DataSource): Promise<RemoteLibraryOps | null> {
  if (dataSource.type !== "webdav" && dataSource.type !== "onedrive") return null;

  if (__DEV__ && (dataSource.id === "seed-webdav-fixture" || dataSource.id === "seed-onedrive-fixture")) {
    return createFixtureBrowseOps(dataSource);
  }

  const backend = await createRemoteBackend(dataSource, browsePlaceholderLibrary(dataSource));
  if (!backend) return null;

  return buildRemoteOps(backend, dataSource, "browse");
}

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

  return buildRemoteOps(backend, source, "library");
}