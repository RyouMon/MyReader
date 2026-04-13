import { Directory, File, Paths } from "expo-file-system";
import { Platform } from "react-native";
import { unzip } from "react-native-zip-archive";
import { buildComicManifest, type ComicManifest } from "my-reader-tools/rendition";

const CBZ_CACHE_ROOT = new Directory(Paths.cache, "comic-reader");
const CBZ_ARCHIVE_DIR = new Directory(CBZ_CACHE_ROOT, "archives");
const CBZ_EXTRACT_DIR = new Directory(CBZ_CACHE_ROOT, "extracted");

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

function fileUriToAbsolutePath(input: string): string {
  const n = input.replace(/\\/g, "/").trim();
  if (!n.startsWith("file:")) {
    return n;
  }
  try {
    const pathname = new URL(n).pathname;
    try {
      return decodeURIComponent(pathname);
    } catch {
      return pathname;
    }
  } catch {
    const stripped = n.replace(/^file:\/\//, "");
    const path = stripped.startsWith("/") ? stripped : `/${stripped}`;
    try {
      return decodeURIComponent(path);
    } catch {
      return path;
    }
  }
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
  const root = canonicalIosAbsolutePath(fileUriToAbsolutePath(rootUri)).replace(/\/+$/, "");
  const abs = canonicalIosAbsolutePath(fileUriToAbsolutePath(absolutePath));
  const prefix = `${root}/`;
  if (abs.startsWith(prefix)) {
    return abs.slice(prefix.length);
  }

  return abs.split("/").slice(-1)[0] ?? abs;
}

function ensureFileUrl(pathOrUrl: string): string {
  const p = pathOrUrl.replace(/\\/g, "/");
  if (p.startsWith("file://")) {
    return p;
  }
  if (p.startsWith("/")) {
    return `file://${p}`;
  }
  return `file:///${p}`;
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

async function collectExtractedEntries(dir: Directory, rootUri: string, bucket: ExtractedFileEntry[]) {
  const entries = dir.list();
  for (const entry of entries) {
    if (entry instanceof Directory) {
      await collectExtractedEntries(entry, rootUri, bucket);
      continue;
    }
    bucket.push({
      relativePath: normalizeExtractedPath(rootUri, entry.uri),
      fileUri: entry.uri,
    });
  }
}

async function materializeArchiveFromBytes(cacheKey: string, bytes: Uint8Array) {
  ensureDir(CBZ_CACHE_ROOT);
  ensureDir(CBZ_ARCHIVE_DIR);

  const archiveFile = new File(CBZ_ARCHIVE_DIR, `${cacheKey}.cbz`);
  if (!archiveFile.exists) {
    archiveFile.create({ overwrite: true, intermediates: true });
  }
  archiveFile.write(bytes);
  return archiveFile;
}

export async function prepareCbzDocument(input: {
  bookId: number;
  format: string;
  source: NativeComicSource;
}): Promise<NativeComicDocument> {
  ensureDir(CBZ_CACHE_ROOT);
  ensureDir(CBZ_EXTRACT_DIR);

  const cacheKey = createCacheKey(input.bookId, input.format, input.source.fingerprint);
  const extractionDir = new Directory(CBZ_EXTRACT_DIR, cacheKey);

  const archiveFile =
    input.source.type === "bytes"
      ? await materializeArchiveFromBytes(cacheKey, input.source.bytes)
      : new File(input.source.archiveUri);

  const archiveSnapshot = describeArchiveFile(archiveFile);
  const extractionSnapshot = describeDirectory(extractionDir);

  console.info("[mobile-reader] cbz:prepare:start", {
    platform: Platform.OS,
    bookId: input.bookId,
    format: input.format,
    cacheKey,
    sourceType: input.source.type,
    ownsArchiveFile: input.source.type === "bytes" || Boolean(input.source.ownsArchiveFile),
    fingerprint: input.source.fingerprint,
    archiveFile: archiveSnapshot,
    extractionDir: extractionSnapshot,
  });

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
    const rawDest = await unzip(archiveFile.uri, extractionDir.uri);
    extractionUri = ensureFileUrl(rawDest);
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
  const extractedEntries: ExtractedFileEntry[] = [];
  await collectExtractedEntries(extractedRoot, extractionUri, extractedEntries);

  const relativePaths = extractedEntries.map((e) => e.relativePath);
  const fileUriByRelativePath = new Map(
    extractedEntries.map((e) => [e.relativePath.replace(/\\/g, "/"), e.fileUri] as const),
  );

  console.info("[mobile-reader] cbz:prepare:files-collected", {
    cacheKey,
    extractedFileCount: relativePaths.length,
    firstFiles: relativePaths.slice(0, 10),
  });

  const manifest = buildComicManifest(relativePaths);
  const pageUris = manifest.pages.map((page) => {
    const direct = fileUriByRelativePath.get(page.path);
    if (direct) {
      return direct;
    }
    return new File(extractedRoot, ...page.path.split("/")).uri;
  });

  console.info("[mobile-reader] cbz:prepare:manifest-ready", {
    cacheKey,
    tocCount: manifest.toc.length,
    pageCount: manifest.pages.length,
    firstPageUri: pageUris[0] ?? null,
  });

  return {
    cacheKey,
    archiveUri: archiveFile.uri,
    extractionUri,
    manifest,
    pageUris,
    ownsArchiveFile: input.source.type === "bytes" || Boolean(input.source.ownsArchiveFile),
  };
}

export function disposeNativeComicDocument(doc: Pick<NativeComicDocument, "archiveUri" | "extractionUri" | "ownsArchiveFile">) {
  if (doc.ownsArchiveFile) {
    const archiveFile = new File(doc.archiveUri);
    if (archiveFile.exists) {
      archiveFile.delete();
    }
  }

  const extractionDir = new Directory(doc.extractionUri);
  if (extractionDir.exists) {
    extractionDir.delete();
  }
}
