import { Directory, File, Paths } from "expo-file-system";
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

function normalizeExtractedPath(rootUri: string, absolutePath: string) {
  const normalizedRoot = rootUri.replace(/\\/g, "/").replace(/\/+$/, "");
  const normalizedAbsolute = absolutePath.replace(/\\/g, "/");

  if (normalizedAbsolute.startsWith(`${normalizedRoot}/`)) {
    return normalizedAbsolute.slice(normalizedRoot.length + 1);
  }

  return normalizedAbsolute.split("/").slice(-1)[0] ?? normalizedAbsolute;
}

function safeKeyPart(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-");
}

function createCacheKey(bookId: number, format: string, fingerprint: string) {
  return `${safeKeyPart(String(bookId))}-${safeKeyPart(format.toLowerCase())}-${safeKeyPart(fingerprint)}`;
}

function ensureCleanDir(dir: Directory) {
  if (dir.exists) {
    dir.delete();
  }
  dir.create({ idempotent: true, intermediates: true });
  return dir;
}

async function collectFiles(dir: Directory, rootUri: string, bucket: string[]) {
  const entries = dir.list();
  for (const entry of entries) {
    if (entry instanceof Directory) {
      await collectFiles(entry, rootUri, bucket);
      continue;
    }
    bucket.push(normalizeExtractedPath(rootUri, entry.uri));
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

  ensureCleanDir(extractionDir);
  const extractionUri = await unzip(archiveFile.uri, extractionDir.uri);
  const extractedRoot = new Directory(extractionUri);
  const extractedFiles: string[] = [];
  await collectFiles(extractedRoot, extractionUri, extractedFiles);

  const manifest = buildComicManifest(extractedFiles);
  const pageUris = manifest.pages.map((page) => new File(extractedRoot, ...page.path.split("/")).uri);

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
