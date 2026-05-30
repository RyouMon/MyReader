import type { Library, DataSource } from "../types";
import type { RemoteBackend } from "../../services/remote/backend";
import { createRemoteBackend } from "../../services/remote/factory";
import { forceRefreshMetadata } from "./remote-library-shared";

type MetadataCheckResult =
  | { changed: false; etag: string }
  | { changed: true; etag: string; library: Library };

async function checkMetadataEtag(
  backend: RemoteBackend,
  library: Library,
): Promise<{ changed: boolean; etag: string }> {
  const stat = await backend.statRemoteFile("metadata.db");
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

  try {
    const newMetadataUri = await forceRefreshMetadata(library, backend);
    const updated: Library = {
      ...library,
      metadataEtag: etag,
      metadataUri: newMetadataUri,
    };
    return { changed: true, etag, library: updated };
  } catch (error) {
    console.warn("[metadata] forceRefreshMetadata failed during stale check:", {
      libraryId: library.id,
      error,
    });
    return { changed: false, etag: library.metadataEtag ?? "" };
  }
}