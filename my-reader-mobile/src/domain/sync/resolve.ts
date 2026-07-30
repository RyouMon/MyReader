import type { DataSource, Library } from "../types"
import { LOCAL_LIBRARY_DATA_SOURCE_ID } from "../../constants/local-library-data-source"
import {
  libraryRootUri,
  librarySidecarRootUri,
} from "@/src/services/fs/library-paths"
import { toNativeFilesystemPath } from "@/src/services/fs/path"
import { SyncConfigError } from "../../errors"
import { resolveRemoteBackend } from "../../services/remote/factory"
import type { RemoteBackend } from "../../services/remote/backend"
import {
  resolveLibraryStorage,
  type LibraryStorageConfig,
} from "../../services/core/sync"
import { appConfigPath } from "../../services/core/app-config"
import { LocalDirectBackend } from "./local"
import i18n from "@/src/i18n"

export type SyncBackend = RemoteBackend | LocalDirectBackend

export type ResolvedSyncTarget = {
  backend: SyncBackend
  libraryStorage: LibraryStorageConfig
  dataSourceId: string
  libraryId: string
  /** Calibre tree root (metadata, books, covers). */
  libraryRootUri: string
  /** Root for `{root}/.myreader/` sidecar data. */
  librarySidecarRootUri: string
}

export async function resolveSyncTarget(
  library: Library,
  dataSources: DataSource[],
): Promise<ResolvedSyncTarget> {
  const rootUri = libraryRootUri(library)
  const sidecarRootUri = librarySidecarRootUri(library)

  if (library.sourceType === "webdav") {
    const rawSource = dataSources.find(
      (item) => item.id === library.dataSourceId && item.type === "webdav",
    )
    if (!rawSource || rawSource.type !== "webdav") {
      throw new SyncConfigError(i18n.t("sync.webdavSourceNotFound"))
    }
    const resolved = await resolveRemoteBackend(rawSource, library)
    if (!resolved)
      throw new SyncConfigError(i18n.t("sync.webdavPasswordMissing"))
    return {
      backend: resolved.backend,
      libraryStorage: resolved.libraryStorage,
      dataSourceId: rawSource.id,
      libraryId: library.id,
      libraryRootUri: rootUri,
      librarySidecarRootUri: sidecarRootUri,
    }
  }

  if (library.sourceType === "onedrive") {
    const rawSource = dataSources.find(
      (item) => item.id === library.dataSourceId && item.type === "onedrive",
    )
    if (!rawSource || rawSource.type !== "onedrive") {
      throw new SyncConfigError(i18n.t("sync.onedriveSourceNotFound"))
    }
    const resolved = await resolveRemoteBackend(rawSource, library)
    if (!resolved)
      throw new SyncConfigError(i18n.t("sync.onedriveRefreshTokenMissing"))
    return {
      backend: resolved.backend,
      libraryStorage: resolved.libraryStorage,
      dataSourceId: rawSource.id,
      libraryId: library.id,
      libraryRootUri: rootUri,
      librarySidecarRootUri: sidecarRootUri,
    }
  }

  const backend = new LocalDirectBackend(rootUri)
  return {
    backend,
    libraryStorage: resolveLibraryStorage({
      configPath: appConfigPath,
      libraryId: library.id,
      localRootPath: toNativeFilesystemPath(rootUri),
    }),
    dataSourceId: library.dataSourceId ?? LOCAL_LIBRARY_DATA_SOURCE_ID,
    libraryId: library.id,
    libraryRootUri: rootUri,
    librarySidecarRootUri: sidecarRootUri,
  }
}

export function isLocalDirect(
  backend: SyncBackend,
): backend is LocalDirectBackend {
  return backend.kind === "local-direct"
}

export function isRemoteBackend(
  backend: SyncBackend,
): backend is RemoteBackend {
  return backend.kind === "onedrive" || backend.kind === "webdav"
}
