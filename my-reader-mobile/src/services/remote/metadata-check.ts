import type { Library, DataSource } from "../../data/types";
import type { RemoteBackend } from "./backend";
import { createRemoteBackend } from "./factory";
import { useAppStore } from "../../store/app-store";
import { forceRefreshMetadata } from "../../domain/library/remote-library-shared";

export type MetadataCheckResult =
  | { changed: false; etag: string }
  | { changed: true; etag: string; library: Library };

export async function checkMetadataEtag(
  backend: RemoteBackend,
  library: Library,
): Promise<{ changed: boolean; etag: string }> {
  const remoteBase = backend.normalizePath(library.sourcePath ?? library.path);
  const stat = await backend.statRemoteFile(`${remoteBase}/metadata.db`);
  if (!stat) {
    return { changed: false, etag: library.metadataEtag ?? "" };
  }
  const newEtag = stat.etag ?? `${stat.mtimeMs}-${stat.size}`;
  if (library.metadataEtag && library.metadataEtag === newEtag) {
    return { changed: false, etag: newEtag };
  }
  return { changed: true, etag: newEtag };
}

export async function refreshMetadataIfStale(
  library: Library,
  dataSources: DataSource[],
): Promise<MetadataCheckResult> {
  const dataSource = dataSources.find((ds) => ds.id === library.dataSourceId) ?? null;
  if (!dataSource) {
    return { changed: false, etag: library.metadataEtag ?? "" };
  }

  const backend = await createRemoteBackend(dataSource, library);
  if (!backend) {
    return { changed: false, etag: library.metadataEtag ?? "" };
  }

  const { changed, etag } = await checkMetadataEtag(backend, library);
  if (!changed) {
    return { changed: false, etag };
  }

  const newMetadataUri = await forceRefreshMetadata(library, backend);

  const updated: Library = {
    ...library,
    metadataEtag: etag,
    ...(newMetadataUri ? { metadataUri: newMetadataUri } : {}),
  };

  const state = useAppStore.getState();
  const nextLibraries = state.libraries.map((l: Library) => (l.id === library.id ? updated : l));
  state.setLibraries(nextLibraries);

  return { changed: true, etag, library: updated };
}
