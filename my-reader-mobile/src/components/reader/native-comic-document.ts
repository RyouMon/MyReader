import { Directory, File } from "expo-file-system";
import { Platform } from "react-native";
import { unzip } from "react-native-zip-archive";
import { buildComicManifest, type ComicManifest } from "my-reader-tools/utils";
import { READER_EXTRACTED_CACHE_DIR, ensureReaderCacheDirectories } from "@/src/data/cache";
import { toFileUri, toNativeFilesystemPath } from "@/src/utils/io";

const CBZ_CACHE_ROOT = new Directory(READER_EXTRACTED_CACHE_DIR, "comic");
const CBZ_ARCHIVE_DIR = new Directory(CBZ_CACHE_ROOT, "archives");
const CBZ_EXTRACT_DIR = new Directory(CBZ_CACHE_ROOT, "extracted");
const CBZ_CACHE_METADATA_FILE = ".myreader-comic-cache.json";
const CBZ_CACHE_METADATA_VERSION = 1;

export type NativeComicDocument = {
  cacheKey: string;
  archiveUri: string;
  extractionUri: string;
  manifest: ComicManifest;
  pageUris: string[];
  ownsArchiveFile: boolean;
};

type NativeComicSource =
  | {
      type: "path";
      archiveUri: string;
      fingerprint: string;
      ownsArchiveFile?: boolean;
    }
  | {
      type: "bytes";
      bytes: Uint8Array;
      fingerprint: string;
    };

function ensureDir(dir: Directory) {
  if (!dir.exists) {
    dir.create({ idempotent: true, intermediates: true });
  }
  return dir;
}

function canonicalIosAbsolutePath(p: string): string {
  if (Platform.OS !== "ios") {
    return p;
  }
  if (p.startsWith("/var/") && !p.startsWith("/private/")) {
    return `/private${p}`;
  }
  return p;
}

function normalizeExtractedPath(rootUri: string, absolutePath: string) {
  const root = canonicalIosAbsolutePath(toNativeFilesystemPath(rootUri)).replace(/\/+$/, "");
  const abs = canonicalIosAbsolutePath(toNativeFilesystemPath(absolutePath));
  const prefix = `${root}/`;
  if (abs.startsWith(prefix)) {
    return abs.slice(prefix.length);
  }

  return abs.split("/").slice(-1)[0] ?? abs;
}
/**
 * Converts a file URI/path into the decoded native absolute path expected by
 * `react-native-zip-archive` on iOS/Android.
 */
function toNativeZipPath(pathOrUrl: string): string {
  return canonicalIosAbsolutePath(toNativeFilesystemPath(pathOrUrl));
}

function safeKeyPart(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-");
}

function fnv1a32Hex(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

function compactFingerprintForCacheKey(fingerprint: string): string {
  const sanitized = safeKeyPart(fingerprint);
  if (sanitized.length <= 96) {
    return sanitized;
  }
  return `fp-${fnv1a32Hex(fingerprint)}`;
}

function createCacheKey(bookId: number, format: string, fingerprint: string) {
  return `${safeKeyPart(String(bookId))}-${safeKeyPart(format.toLowerCase())}-${compactFingerprintForCacheKey(fingerprint)}`;
}

function ensureCleanDir(dir: Directory) {
  if (dir.exists) {
    dir.delete();
  }
  dir.create({ idempotent: true, intermediates: true });
  return dir;
}

function describeArchiveFile(file: File) {
  return {
    uri: file.uri,
    exists: file.exists,
    size: file.size ?? null,
    name: file.name ?? null,
    extension: file.extension ?? null,
    md5: file.md5 ?? null,
    parentDirectory: file.parentDirectory?.uri ?? null,
  };
}

function describeDirectory(dir: Directory) {
  return {
    uri: dir.uri,
    exists: dir.exists,
    name: dir.name ?? null,
    parentDirectory: dir.parentDirectory?.uri ?? null,
  };
}

type ExtractedFileEntry = {
  relativePath: string;
  fileUri: string;
};

type ExtractedComicPayload = {
  extractionUri: string;
  manifest: ComicManifest;
  pageUris: string[];
  relativePaths: string[];
};

type ExtractedComicCacheMetadata = {
  version: typeof CBZ_CACHE_METADATA_VERSION;
  cacheKey: string;
  fingerprint: string;
  archiveUri: string;
  relativePaths: string[];
  pageCount: number;
};

/**
 * Recursively collects files under an extracted CBZ directory.
 */
async function collectExtractedEntries(dir: Directory, rootUri: string, bucket: ExtractedFileEntry[]) {
  const entries = dir.list();
  for (const entry of entries) {
    if (entry instanceof Directory) {
      await collectExtractedEntries(entry, rootUri, bucket);
      continue;
    }
    if (entry.name === CBZ_CACHE_METADATA_FILE) {
      continue;
    }
    bucket.push({
      relativePath: normalizeExtractedPath(rootUri, entry.uri),
      fileUri: entry.uri,
    });
  }
}

/**
 * Builds the comic manifest and page URIs from an existing extraction directory.
 */
async function readExtractedComicPayload(extractionDir: Directory): Promise<ExtractedComicPayload | null> {
  if (!extractionDir.exists) {
    return null;
  }

  const extractionUri = extractionDir.uri;
  const extractedEntries: ExtractedFileEntry[] = [];
  await collectExtractedEntries(extractionDir, extractionUri, extractedEntries);

  const relativePaths = extractedEntries.map((e) => e.relativePath);
  const fileUriByRelativePath = new Map(
    extractedEntries.map((e) => [e.relativePath.replace(/\\/g, "/"), e.fileUri] as const),
  );
  const manifest = buildComicManifest(relativePaths);
  if (manifest.pages.length === 0) {
    return null;
  }

  const pageUris = manifest.pages.map((page) => {
    const direct = fileUriByRelativePath.get(page.path);
    if (direct) {
      return direct;
    }
    return new File(extractionDir, ...page.path.split("/")).uri;
  });

  return {
    extractionUri,
    manifest,
    pageUris,
    relativePaths,
  };
}

/**
 * Reads the extraction metadata used to validate persistent CBZ caches.
 */
async function readCacheMetadata(extractionDir: Directory): Promise<ExtractedComicCacheMetadata | null> {
  const metadataFile = new File(extractionDir, CBZ_CACHE_METADATA_FILE);
  if (!metadataFile.exists) {
    return null;
  }

  try {
    const value = JSON.parse(await metadataFile.text()) as Partial<ExtractedComicCacheMetadata>;
    if (
      value.version !== CBZ_CACHE_METADATA_VERSION ||
      typeof value.cacheKey !== "string" ||
      typeof value.fingerprint !== "string" ||
      typeof value.archiveUri !== "string" ||
      !Array.isArray(value.relativePaths) ||
      typeof value.pageCount !== "number"
    ) {
      return null;
    }
    return {
      version: CBZ_CACHE_METADATA_VERSION,
      cacheKey: value.cacheKey,
      fingerprint: value.fingerprint,
      archiveUri: value.archiveUri,
      relativePaths: value.relativePaths.filter((path): path is string => typeof path === "string"),
      pageCount: value.pageCount,
    };
  } catch {
    return null;
  }
}

/**
 * Stores extraction metadata after a successful unzip.
 */
function writeCacheMetadata(input: {
  extractionDir: Directory;
  cacheKey: string;
  fingerprint: string;
  archiveUri: string;
  payload: ExtractedComicPayload;
}): void {
  const metadataFile = new File(input.extractionDir, CBZ_CACHE_METADATA_FILE);
  metadataFile.create({ overwrite: true, intermediates: true });
  metadataFile.write(
    JSON.stringify({
      version: CBZ_CACHE_METADATA_VERSION,
      cacheKey: input.cacheKey,
      fingerprint: input.fingerprint,
      archiveUri: input.archiveUri,
      relativePaths: input.payload.relativePaths,
      pageCount: input.payload.pageUris.length,
    } satisfies ExtractedComicCacheMetadata),
  );
}

/**
 * Returns a cache payload only when metadata and extracted files are complete.
 */
async function readCachedExtractedComicPayload(input: {
  extractionDir: Directory;
  cacheKey: string;
  fingerprint: string;
}): Promise<ExtractedComicPayload | null> {
  const metadata = await readCacheMetadata(input.extractionDir);
  if (
    !metadata ||
    metadata.cacheKey !== input.cacheKey ||
    metadata.fingerprint !== input.fingerprint
  ) {
    return null;
  }

  const payload = await readExtractedComicPayload(input.extractionDir);
  if (!payload || payload.pageUris.length !== metadata.pageCount) {
    return null;
  }

  const extractedPathSet = new Set(payload.relativePaths);
  if (!metadata.relativePaths.every((path) => extractedPathSet.has(path))) {
    return null;
  }

  return payload;
}

/**
 * Returns the deterministic archive cache file used when the source is bytes.
 */
function archiveFileForBytesCache(cacheKey: string): File {
  return new File(CBZ_ARCHIVE_DIR, `${cacheKey}.cbz`);
}

/**
 * Writes a byte-backed CBZ archive into the managed cache for native unzip.
 */
async function materializeArchiveFromBytes(cacheKey: string, bytes: Uint8Array) {
  ensureDir(CBZ_CACHE_ROOT);
  ensureDir(CBZ_ARCHIVE_DIR);

  const archiveFile = archiveFileForBytesCache(cacheKey);
  if (!archiveFile.exists) {
    archiveFile.create({ overwrite: true, intermediates: true });
  }
  archiveFile.write(bytes);
  return archiveFile;
}

/**
 * Prepares a CBZ document, reusing a valid extracted cache before unzipping.
 */
export async function prepareCbzDocument(input: {
  bookId: number;
  format: string;
  source: NativeComicSource;
}): Promise<NativeComicDocument> {
  ensureReaderCacheDirectories();
  ensureDir(CBZ_CACHE_ROOT);
  ensureDir(CBZ_EXTRACT_DIR);

  const cacheKey = createCacheKey(input.bookId, input.format, input.source.fingerprint);
  const extractionDir = new Directory(CBZ_EXTRACT_DIR, cacheKey);
  const ownsArchiveFile = input.source.type === "bytes" || Boolean(input.source.ownsArchiveFile);
  const cachedArchiveFile =
    input.source.type === "bytes"
      ? archiveFileForBytesCache(cacheKey)
      : new File(input.source.archiveUri);

  const archiveSnapshot = describeArchiveFile(cachedArchiveFile);
  const extractionSnapshot = describeDirectory(extractionDir);

  console.info("[mobile-reader] cbz:prepare:start", {
    platform: Platform.OS,
    bookId: input.bookId,
    format: input.format,
    cacheKey,
    sourceType: input.source.type,
    ownsArchiveFile,
    fingerprint: input.source.fingerprint,
    archiveFile: archiveSnapshot,
    extractionDir: extractionSnapshot,
  });

  const cachedPayload = await readCachedExtractedComicPayload({
    extractionDir,
    cacheKey,
    fingerprint: input.source.fingerprint,
  });
  if (cachedPayload) {
    console.info("[mobile-reader] cbz:prepare:cache-hit", {
      cacheKey,
      extractionUri: cachedPayload.extractionUri,
      extractedFileCount: cachedPayload.relativePaths.length,
      pageCount: cachedPayload.pageUris.length,
      firstFiles: cachedPayload.relativePaths.slice(0, 10),
    });

    return {
      cacheKey,
      archiveUri: cachedArchiveFile.uri,
      extractionUri: cachedPayload.extractionUri,
      manifest: cachedPayload.manifest,
      pageUris: cachedPayload.pageUris,
      ownsArchiveFile,
    };
  }

  const archiveFile =
    input.source.type === "bytes"
      ? await materializeArchiveFromBytes(cacheKey, input.source.bytes)
      : new File(input.source.archiveUri);

  ensureCleanDir(extractionDir);

  console.info("[mobile-reader] cbz:prepare:unzip-attempt", {
    archiveUri: archiveFile.uri,
    extractionUri: extractionDir.uri,
    archiveExists: archiveFile.exists,
    archiveSize: archiveFile.size ?? null,
    extractionDirExists: extractionDir.exists,
    extractionDirName: extractionDir.name ?? null,
  });

  let extractionUri: string;
  try {
    const archiveNativePath = toNativeZipPath(archiveFile.uri);
    const extractionNativePath = toNativeZipPath(extractionDir.uri);
    console.info("[mobile-reader] cbz:prepare:unzip-native-paths", {
      cacheKey,
      archiveNativePath,
      extractionNativePath,
    });
    const rawDest = await unzip(archiveNativePath, extractionNativePath);
    extractionUri = toFileUri(rawDest);
  } catch (error) {
    console.error("[mobile-reader] cbz:prepare:unzip-failed", {
      platform: Platform.OS,
      bookId: input.bookId,
      format: input.format,
      cacheKey,
      sourceType: input.source.type,
      fingerprint: input.source.fingerprint,
      archiveFile: describeArchiveFile(archiveFile),
      extractionDir: describeDirectory(extractionDir),
      error,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorName: error instanceof Error ? error.name : null,
      errorCause: error instanceof Error ? error.cause : null,
    });
    throw error;
  }

  console.info("[mobile-reader] cbz:prepare:unzip-done", {
    cacheKey,
    extractionUri,
  });

  const extractedRoot = new Directory(extractionUri);
  const payload = await readExtractedComicPayload(extractedRoot);
  if (!payload) {
    throw new Error("CBZ 解压后未找到可阅读的图片页面");
  }
  writeCacheMetadata({
    extractionDir: extractedRoot,
    cacheKey,
    fingerprint: input.source.fingerprint,
    archiveUri: archiveFile.uri,
    payload,
  });

  console.info("[mobile-reader] cbz:prepare:files-collected", {
    cacheKey,
    extractedFileCount: payload.relativePaths.length,
    firstFiles: payload.relativePaths.slice(0, 10),
  });

  console.info("[mobile-reader] cbz:prepare:manifest-ready", {
    cacheKey,
    tocCount: payload.manifest.toc.length,
    pageCount: payload.manifest.pages.length,
    firstPageUri: payload.pageUris[0] ?? null,
  });

  return {
    cacheKey,
    archiveUri: archiveFile.uri,
    extractionUri: payload.extractionUri,
    manifest: payload.manifest,
    pageUris: payload.pageUris,
    ownsArchiveFile,
  };
}

/**
 * Releases transient CBZ resources while leaving extracted pages to cache policy.
 */
export function disposeNativeComicDocument(
  doc: Pick<NativeComicDocument, "archiveUri" | "ownsArchiveFile">,
) {
  if (doc.ownsArchiveFile) {
    const archiveFile = new File(doc.archiveUri);
    if (archiveFile.exists) {
      archiveFile.delete();
    }
  }
}
