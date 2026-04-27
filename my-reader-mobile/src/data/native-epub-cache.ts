import { Directory, File } from "expo-file-system";
import { unzip } from "react-native-zip-archive";

import { READER_EXTRACTED_CACHE_DIR, ensureReaderCacheDirectories } from "./cache";
import { toFileUri, toNativeFilesystemPath } from "../utils/io";

const EPUB_CACHE_ROOT = new Directory(READER_EXTRACTED_CACHE_DIR, "epub");
const EPUB_ARCHIVE_DIR = new Directory(EPUB_CACHE_ROOT, "archives");
const EPUB_EXTRACT_DIR = new Directory(EPUB_CACHE_ROOT, "extracted");

/**
 * Ensures the target directory exists and is empty.
 */
function ensureCleanDir(dir: Directory): void {
  if (dir.exists) {
    dir.delete();
  }
  dir.create({ idempotent: true, intermediates: true });
}

/**
 * Sanitizes cache key segments.
 */
function safePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-");
}

/**
 * Creates deterministic cache key for extracted EPUB artifacts.
 */
function createCacheKey(bookId: number, format: string, fingerprint: string): string {
  return `${safePart(String(bookId))}-${safePart(format.toLowerCase())}-${safePart(fingerprint)}`;
}

/**
 * Extracts EPUB archive using native unzip into managed cache directory.
 */
export async function extractEpubToCache(input: {
  bookId: number;
  format: string;
  archiveUri: string;
  fingerprint: string;
}): Promise<{ cacheKey: string; extractionUri: string }> {
  ensureReaderCacheDirectories();
  if (!EPUB_CACHE_ROOT.exists) {
    EPUB_CACHE_ROOT.create({ idempotent: true, intermediates: true });
  }
  if (!EPUB_ARCHIVE_DIR.exists) {
    EPUB_ARCHIVE_DIR.create({ idempotent: true, intermediates: true });
  }
  if (!EPUB_EXTRACT_DIR.exists) {
    EPUB_EXTRACT_DIR.create({ idempotent: true, intermediates: true });
  }

  const cacheKey = createCacheKey(input.bookId, input.format, input.fingerprint);
  const extractionDir = new Directory(EPUB_EXTRACT_DIR, cacheKey);
  ensureCleanDir(extractionDir);

  const archiveFile = new File(input.archiveUri);
  if (!archiveFile.exists) {
    throw new Error(`EPUB archive not found: ${input.archiveUri}`);
  }
  const destination = await unzip(toNativeFilesystemPath(archiveFile.uri), toNativeFilesystemPath(extractionDir.uri));
  return {
    cacheKey,
    extractionUri: toFileUri(destination),
  };
}
