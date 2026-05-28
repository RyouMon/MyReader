import { Directory, File, Paths } from "expo-file-system";

import type { BookItem, DataSource, Library } from "../types";
import type { RemoteBackend } from "../../services/remote/backend";
import { createRemoteBackend } from "../../services/remote/factory";
import { buildRemoteCoverUri } from "../../services/remote/cover-url";

const COVERS_DIR_NAME = "library-covers";
const CONCURRENT_COVER_DOWNLOADS = 3;

function coversRoot(): Directory {
  return new Directory(Paths.document, COVERS_DIR_NAME);
}

function libraryCoversDir(libraryId: string): Directory {
  return new Directory(coversRoot(), libraryId);
}

function writeCoverWithRetry(destFile: File, bytes: Uint8Array): void {
  const ensureFileReady = () => {
    const dir = destFile.parentDirectory;
    if (dir && !dir.exists) {
      dir.create({ intermediates: true, idempotent: true });
    }
    if (!destFile.exists) {
      destFile.create({ intermediates: true, overwrite: true });
    }
  };

  ensureFileReady();
  try {
    destFile.write(bytes);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/doesn.?t exist/i.test(message) && !/does not exist/i.test(message)) {
      throw error;
    }
    ensureFileReady();
    destFile.write(bytes);
  }
}

export function localCoverPath(libraryId: string, bookPath: string): string {
  const segments = bookPath.split("/").filter(Boolean);
  const dir = new Directory(libraryCoversDir(libraryId), ...segments);
  const file = new File(dir, "cover.jpg");
  return file.uri;
}

export function hasLocalCover(libraryId: string, bookPath: string): boolean {
  const file = new File(localCoverPath(libraryId, bookPath));
  return file.exists && (file.size ?? 0) > 0;
}

export function resolveCoverUri(
  library: Library,
  backend: RemoteBackend,
  bookPath: string,
  hasCover: boolean,
): BookItem["coverUri"] {
  if (!bookPath || !hasCover) return undefined;

  if (hasLocalCover(library.id, bookPath)) {
    return localCoverPath(library.id, bookPath);
  }

  return buildRemoteCoverUri(library, backend, bookPath, hasCover);
}

export async function downloadCover(
  libraryId: string,
  bookPath: string,
  backend: RemoteBackend,
  remoteCoverPath: string,
): Promise<void> {
  const destPath = localCoverPath(libraryId, bookPath);
  const destFile = new File(destPath);
  if (destFile.exists && (destFile.size ?? 0) > 0) return;

  const dir = destFile.parentDirectory;
  if (dir && !dir.exists) {
    dir.create({ intermediates: true, idempotent: true });
  }
  if (!destFile.exists) {
    destFile.create({ overwrite: true });
  }

  try {
    const cachedFile = await backend.downloadToCache(
      remoteCoverPath,
      `cover-${libraryId}-${Date.now()}`,
    );
    const bytes = await cachedFile.bytes();
    writeCoverWithRetry(destFile, bytes);
    cachedFile.delete();
  } catch (e) {
    console.warn("[cover-mirror] download failed:", {
      libraryId,
      bookPath,
      remoteCoverPath,
      error: e,
    });
  }
}

export function clearCoversForLibrary(libraryId: string): void {
  const dir = libraryCoversDir(libraryId);
  if (dir.exists) dir.delete();
}

export async function mirrorMissingCovers(
  library: Library,
  dataSources: DataSource[],
  books: BookItem[],
): Promise<void> {
  if (!library.dataSourceId) return;

  const dataSource = dataSources.find((ds) => ds.id === library.dataSourceId);
  if (!dataSource) return;

  const backendOrNull = await createRemoteBackend(dataSource, library);
  if (!backendOrNull) return;
  const backend: RemoteBackend = backendOrNull;

  const missing = books.filter(
    (b) => b.hasCover && b.path && !hasLocalCover(library.id, b.path),
  );

  if (missing.length === 0) return;

  console.info("[cover-mirror] mirroring missing covers:", {
    libraryId: library.id,
    missingCount: missing.length,
  });

  const libraryRoot = backend.normalizePath(library.sourcePath ?? library.path);

  let active = 0;
  let idx = 0;

  await new Promise<void>((resolve) => {
    function next(): void {
      while (active < CONCURRENT_COVER_DOWNLOADS && idx < missing.length) {
        const book = missing[idx]!;
        idx += 1;
        active += 1;
        const rcp = `${book.path}/cover.jpg`;
        void downloadCover(library.id, book.path!, backend, rcp)
          .then(() => {
            active -= 1;
            if (idx >= missing.length && active === 0) resolve();
            else next();
          })
          .catch(() => {
            active -= 1;
            if (idx >= missing.length && active === 0) resolve();
            else next();
          });
      }
      if (idx >= missing.length && active === 0) resolve();
    }
    next();
  });

  console.info("[cover-mirror] done:", { libraryId: library.id });
}