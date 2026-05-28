import { Directory, File, Paths } from "expo-file-system";
import { toNativeFilesystemPath } from "./path";

const READER_CACHE_ROOT = new Directory(Paths.cache, "myreader");
const READER_EXTRACTED_CACHE_DIR = new Directory(READER_CACHE_ROOT, "extracted");
export const READER_LOCAL_COPY_CACHE_DIR = new Directory(READER_CACHE_ROOT, "local-copies");

type CacheFileStat = {
  file: File;
  size: number;
  modifiedAtMs: number;
};

const EXTRACTED_ARCHIVE_METADATA_FILE = ".myreader-comic-cache.json";

/**
 * Ensures reader cache directories exist.
 */
export function ensureReaderCacheDirectories(): void {
  if (!READER_CACHE_ROOT.exists) {
    READER_CACHE_ROOT.create({ idempotent: true, intermediates: true });
  }
  if (!READER_EXTRACTED_CACHE_DIR.exists) {
    READER_EXTRACTED_CACHE_DIR.create({ idempotent: true, intermediates: true });
  }
  if (!READER_LOCAL_COPY_CACHE_DIR.exists) {
    READER_LOCAL_COPY_CACHE_DIR.create({ idempotent: true, intermediates: true });
  }
}

/**
 * Recursively collects all files in a directory.
 */
function collectFilesRecursively(dir: Directory, out: File[]): void {
  if (!dir.exists) return;
  for (const entry of dir.list()) {
    if (entry instanceof Directory) {
      collectFilesRecursively(entry, out);
      continue;
    }
    out.push(entry);
  }
}

/**
 * Recursively collects extracted cache directories carrying archive metadata.
 */
function collectArchiveMetadataFiles(dir: Directory, out: File[]): void {
  if (!dir.exists) return;
  for (const entry of dir.list()) {
    if (entry instanceof Directory) {
      collectArchiveMetadataFiles(entry, out);
      continue;
    }
    if (entry.name === EXTRACTED_ARCHIVE_METADATA_FILE) {
      out.push(entry);
    }
  }
}

/**
 * Returns tracked reader cache files.
 */
function listReaderCacheFiles(): File[] {
  ensureReaderCacheDirectories();
  const files: File[] = [];
  collectFilesRecursively(READER_EXTRACTED_CACHE_DIR, files);
  collectFilesRecursively(READER_LOCAL_COPY_CACHE_DIR, files);
  return files;
}

/**
 * Returns cache usage summary for settings UI.
 */
export function getReaderCacheUsageSummary(): { totalBytes: number; fileCount: number } {
  const files = listReaderCacheFiles();
  let totalBytes = 0;
  for (const file of files) {
    totalBytes += file.size ?? 0;
  }
  return { totalBytes, fileCount: files.length };
}

/**
 * Deletes reader cache entries for a specific book within a library.
 * Matches local-copy files and extracted directories by libraryId + bookId.
 */
export function clearReaderCachesForBook(libraryId: string, bookId: string): void {
  ensureReaderCacheDirectories();
  const localCopyPrefix = `-${libraryId}-${bookId}-`;
  if (READER_LOCAL_COPY_CACHE_DIR.exists) {
    for (const entry of READER_LOCAL_COPY_CACHE_DIR.list()) {
      if (entry instanceof File && entry.name?.includes(localCopyPrefix)) {
        entry.delete();
      }
    }
  }
  if (READER_EXTRACTED_CACHE_DIR.exists) {
    for (const entry of READER_EXTRACTED_CACHE_DIR.list()) {
      if (entry instanceof Directory && entry.name?.includes(localCopyPrefix)) {
        entry.delete();
      }
    }
  }
}

/**
 * Deletes all managed reader caches.
 */
export function clearAllReaderCaches(): void {
  if (READER_EXTRACTED_CACHE_DIR.exists) {
    READER_EXTRACTED_CACHE_DIR.delete();
  }
  if (READER_LOCAL_COPY_CACHE_DIR.exists) {
    READER_LOCAL_COPY_CACHE_DIR.delete();
  }
  ensureReaderCacheDirectories();
}

/**
 * Deletes extracted reader caches that were derived from a removed archive URI.
 */
export async function clearExtractedReaderCachesForArchiveUri(archiveUri: string): Promise<void> {
  ensureReaderCacheDirectories();
  const targetPath = toNativeFilesystemPath(archiveUri);
  const metadataFiles: File[] = [];
  collectArchiveMetadataFiles(READER_EXTRACTED_CACHE_DIR, metadataFiles);

  for (const metadataFile of metadataFiles) {
    try {
      const metadata = JSON.parse(await metadataFile.text()) as { archiveUri?: unknown };
      if (typeof metadata.archiveUri !== "string") {
        continue;
      }
      if (toNativeFilesystemPath(metadata.archiveUri) !== targetPath) {
        continue;
      }
      const cacheDir = metadataFile.parentDirectory;
      if (cacheDir?.exists) {
        cacheDir.delete();
      }
    } catch {
      continue;
    }
  }
}

/**
 * Applies max cache size with oldest-first eviction.
 */
export function enforceReaderCacheLimit(maxCacheSizeMB: number): void {
  ensureReaderCacheDirectories();
  const maxBytes = Math.max(0, Math.floor(maxCacheSizeMB * 1024 * 1024));
  if (maxBytes <= 0) {
    clearAllReaderCaches();
    return;
  }

  const stats: CacheFileStat[] = listReaderCacheFiles().map((file) => ({
    file,
    size: file.size ?? 0,
    modifiedAtMs: (file.modificationTime ?? 0) * 1000,
  }));
  let totalBytes = stats.reduce((sum, row) => sum + row.size, 0);
  if (totalBytes <= maxBytes) return;

  stats.sort((a, b) => a.modifiedAtMs - b.modifiedAtMs);
  for (const row of stats) {
    if (totalBytes <= maxBytes) break;
    if (row.file.exists) {
      row.file.delete();
      totalBytes -= row.size;
    }
  }
}
