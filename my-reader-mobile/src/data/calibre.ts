import { Directory, File as FSFile, Paths } from "expo-file-system";
import { Platform } from "react-native";

import type { BookDetail, BookIdentifier, FormatSize } from "@my-reader/tools/types/book";
import { showAlertWithStatusBarRestore } from "../constants/alert-with-status-bar";

import {
  createSecurityScopedBookmark,
  withSecurityScopedLibraryAccess,
} from "./security-scoped-bookmarks";
import type { BookItem, Library } from "./types";
import {
  READER_LOCAL_COPY_CACHE_DIR,
  ensureReaderCacheDirectories,
} from "./cache";
import { openDatabaseFromUri } from "./sqlite";
import { localCachedFileUri } from "../utils/io";

type PickedDirectoryLike = {
  uri: string;
  name?: string;
  list?: () => unknown[];
};

type RawBookRow = {
  id: number;
  title: string | null;
  author_sort: string | null;
  authors: string | null;
  path: string | null;
  has_cover: number | null;
  timestamp: string | null;
};

type BookDetailRow = {
  id: number;
  title: string | null;
  author_sort: string | null;
  timestamp: string | null;
  pubdate: string | null;
  series_index: number | null;
  last_modified: string | null;
  path: string | null;
  has_cover: number | null;
  uuid: string | null;
  authors: string | null;
  tags: string | null;
  series: string | null;
  formats: string | null;
  comment: string | null;
  publisher: string | null;
  languages: string | null;
  rating: number | null;
};

const BOOK_DETAIL_QUERY = `
  SELECT
    b.id,
    b.title,
    b.author_sort,
    b.timestamp,
    b.pubdate,
    b.series_index,
    b.last_modified,
    b.path,
    b.has_cover,
    b.uuid,
    (
      SELECT GROUP_CONCAT(a.name, '||')
      FROM authors a
      JOIN books_authors_link bal ON a.id = bal.author
      WHERE bal.book = b.id
    ) AS authors,
    (
      SELECT GROUP_CONCAT(t.name, '||')
      FROM tags t
      JOIN books_tags_link btl ON t.id = btl.tag
      WHERE btl.book = b.id
    ) AS tags,
    (
      SELECT s.name FROM series s
      JOIN books_series_link bsl ON s.id = bsl.series
      WHERE bsl.book = b.id LIMIT 1
    ) AS series,
    (
      SELECT GROUP_CONCAT(d.format, '||')
      FROM data d WHERE d.book = b.id
    ) AS formats,
    (
      SELECT c.text FROM comments c
      WHERE c.book = b.id LIMIT 1
    ) AS comment,
    (
      SELECT p.name FROM publishers p
      JOIN books_publishers_link bpl ON p.id = bpl.publisher
      WHERE bpl.book = b.id LIMIT 1
    ) AS publisher,
    (
      SELECT GROUP_CONCAT(l.lang_code, '||')
      FROM languages l
      JOIN books_languages_link bll ON l.id = bll.lang_code
      WHERE bll.book = b.id
    ) AS languages,
    (
      SELECT r.rating FROM ratings r
      JOIN books_ratings_link brl ON r.id = brl.rating
      WHERE brl.book = b.id LIMIT 1
    ) AS rating
  FROM books b
  WHERE b.id = ?
`;

const BOOKS_QUERY = `
  SELECT
    b.id,
    b.title,
    b.author_sort,
    b.path,
    b.has_cover,
    b.timestamp,
    (
      SELECT GROUP_CONCAT(a.name, '||')
      FROM authors a
      JOIN books_authors_link bal ON a.id = bal.author
      WHERE bal.book = b.id
    ) AS authors
  FROM books b
  ORDER BY b.sort COLLATE NOCASE ASC
`;

function splitConcat(value: string | null) {
  return value ? value.split("||").filter(Boolean) : [];
}

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getMetadataCacheDirectory() {
  return new Directory(Paths.document, "library-metadata-cache");
}

function getMetadataCacheFile(libraryId: string) {
  return new FSFile(getMetadataCacheDirectory(), `${libraryId}.db`);
}

function isCachedMetadataUri(uri: string) {
  return uri.startsWith(Paths.document.uri);
}

function ensureMetadataCacheDirectory() {
  const directory = getMetadataCacheDirectory();

  if (!directory.exists) {
    directory.create({ idempotent: true, intermediates: true });
  }

  return directory;
}

function copyMetadataToCache(sourceUri: string, libraryId: string) {
  ensureMetadataCacheDirectory();

  const source = new FSFile(sourceUri);
  const destination = getMetadataCacheFile(libraryId);

  if (destination.exists) {
    destination.delete();
  }

  source.copy(destination);

  return destination.uri;
}

async function refreshCachedMetadataFromDirectory(library: Library, directoryUri: string) {
  const metadataFile = getMetadataFileFromDirectory({ uri: directoryUri });

  if (!metadataFile) {
    throw new Error("所选书库中未找到 metadata.db，请确认仍是有效的 Calibre 书库");
  }

  return copyMetadataToCache(metadataFile.uri, library.id);
}

function getLibraryRootUri(library: Library, resolvedPath?: string) {
  return resolvedPath ?? library.securityScopedBookmark?.resolvedUri ?? library.path;
}

export function buildCoverUri(
  library: Library,
  bookPath: string | null,
  hasCover: boolean,
  resolvedPath?: string
) {
  if (!bookPath || !hasCover) {
    return undefined;
  }

  const segments = bookPath.split("/").filter(Boolean);
  const coverFile = new FSFile(
    new Directory(getLibraryRootUri(library, resolvedPath)),
    ...segments,
    "cover.jpg"
  );

  return coverFile.uri;
}

function getMetadataFileFromDirectory(directory: PickedDirectoryLike) {
  const typedDirectory = new Directory(directory.uri);
  const entries = (directory.list?.() ?? typedDirectory.list()) as unknown[];
  const metadata = entries.find(
    (entry) => entry instanceof FSFile && entry.name === "metadata.db"
  );

  return metadata instanceof FSFile ? metadata : null;
}

export async function pickCalibreLibrary(): Promise<Library | null> {
  let directory: PickedDirectoryLike | null = null;
  let metadataFile: FSFile | null = null;

  try {
    directory = await Directory.pickDirectoryAsync();
  } catch (error) {
    console.info("[MyReader] 用户取消或未选择书库目录", error);
    return null;
  }

  if (directory == null) {
    console.info("[MyReader] 用户取消或未选择书库目录（无返回目录）");
    return null;
  }

  metadataFile = getMetadataFileFromDirectory(directory);

  if (!metadataFile) {
    showAlertWithStatusBarRestore(
      "未找到 metadata.db",
      "所选目录中未找到 Calibre 的 metadata.db。请选择书库根目录（该文件夹内应包含 metadata.db）。",
      [{ text: "知道了" }]
    );
    return null;
  }

  const libraryRoot = directory;

  const id = createId();
  const securityScopedBookmark = await createSecurityScopedBookmark(libraryRoot.uri);
  const cachedMetadataUri = copyMetadataToCache(metadataFile.uri, id);
  const bookCount = await readBookCountFromMetadata(cachedMetadataUri);
  const resolvedPath = securityScopedBookmark?.resolvedUri ?? libraryRoot.uri;

  return {
    id,
    name: libraryRoot.name || new Directory(libraryRoot.uri).name || "未命名书库",
    path: resolvedPath,
    metadataUri: cachedMetadataUri,
    bookCount,
    addedAt: Date.now(),
    securityScopedBookmark: securityScopedBookmark ?? undefined,
  };
}

export async function ensureLibraryMetadataCached(library: Library): Promise<Library> {
  if (library.sourceType === "webdav") {
    return library;
  }

  if (library.securityScopedBookmark) {
    const { result: cachedMetadataUri, refreshedLibrary } = await withSecurityScopedLibraryAccess(
      library,
      async (resolvedPath) => refreshCachedMetadataFromDirectory(library, resolvedPath)
    );

    return {
      ...(refreshedLibrary ?? library),
      metadataUri: cachedMetadataUri,
    };
  }

  if (isCachedMetadataUri(library.metadataUri!)) {
    return library;
  }

  const cachedMetadataUri = copyMetadataToCache(library.metadataUri!, library.id);

  return {
    ...library,
    metadataUri: cachedMetadataUri,
  };
}

/**
 * Forcefully re-copy metadata.db from the original directory to the app cache,
 * overwriting any existing cached copy. Used by "refresh library".
 */
export async function forceRefreshLibraryMetadata(library: Library): Promise<Library> {
  if (library.sourceType === "webdav") {
    return library;
  }

  if (library.securityScopedBookmark) {
    const { result: cachedMetadataUri, refreshedLibrary } = await withSecurityScopedLibraryAccess(
      library,
      async (resolvedPath) => refreshCachedMetadataFromDirectory(library, resolvedPath)
    );

    const effectiveLibrary = refreshedLibrary ?? library;
    const bookCount = await readBookCountFromMetadata(cachedMetadataUri);
    return {
      ...effectiveLibrary,
      metadataUri: cachedMetadataUri,
      bookCount,
    };
  }

  const cachedMetadataUri = copyMetadataToCache(library.metadataUri!, library.id);
  const bookCount = await readBookCountFromMetadata(cachedMetadataUri);
  return {
    ...library,
    metadataUri: cachedMetadataUri,
    bookCount,
  };
}

export async function readBookCountFromLibrary(library: Library) {
  const nextLibrary = await ensureLibraryMetadataCached(library);
  const bookCount = await readBookCountFromMetadata(nextLibrary.metadataUri!);

  return {
    library: {
      ...nextLibrary,
      bookCount,
    },
    bookCount,
  };
}

/**
 * Resolves a readable metadata.db URI and surfaces a user-facing recovery hint on failure.
 */
async function resolveMetadataUriForRead(library: Library): Promise<string | null> {
  if (library.sourceType === "webdav") {
    const currentMetadata = new FSFile(library.metadataUri!);
    if (currentMetadata.exists) {
      return currentMetadata.uri;
    }

    const fallbackMetadata = new FSFile(Paths.cache, `webdav-${library.id}-metadata.db`);
    if (fallbackMetadata.exists) {
      return fallbackMetadata.uri;
    }
    return library.metadataUri!;
  }

  try {
    const cachedLibrary = await ensureLibraryMetadataCached(library);
    return cachedLibrary.metadataUri!;
  } catch {
    showAlertWithStatusBarRestore(
      "书库数据已损坏",
      "无法恢复该书库的 metadata.db。请删除当前书库并重新添加后再试。",
      [{ text: "知道了" }],
    );
    return null;
  }
}

export async function readBookCountFromMetadata(metadataUri: string) {
  const db = await openDatabaseFromUri(metadataUri);

  try {
    const row = await db.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) as count FROM books"
    );
    return row ? Number(row.count) : 0;
  } finally {
    await db.closeAsync();
  }
}

export async function readBookDetailFromMetadata(
  library: Library,
  calibreBookId: number
): Promise<BookDetail | null> {
  const metadataUri = await resolveMetadataUriForRead(library);
  if (!metadataUri) {
    return null;
  }
  const db = await openDatabaseFromUri(metadataUri);

  try {
    const row = await db.getFirstAsync<BookDetailRow>(BOOK_DETAIL_QUERY, calibreBookId);
    if (!row) {
      return null;
    }

    const formatRows = await db.getAllAsync<{ format: string; uncompressed_size: number | null }>(
      "SELECT format, uncompressed_size FROM data WHERE book = ? ORDER BY format",
      calibreBookId
    );

    const identifierRows = await db.getAllAsync<{ type: string; val: string }>(
      "SELECT type, val FROM identifiers WHERE book = ? ORDER BY type",
      calibreBookId
    );

    const authors = splitConcat(row.authors);
    const tags = splitConcat(row.tags);
    const rawFormats = splitConcat(row.formats);
    const formats = rawFormats.map((f) => f.toUpperCase());
    const languages = splitConcat(row.languages);

    const seriesIndexRaw = row.series_index;
    const seriesIndex =
      seriesIndexRaw !== null && seriesIndexRaw !== undefined && !Number.isNaN(Number(seriesIndexRaw))
        ? Number(seriesIndexRaw)
        : null;

    const formatSizes: FormatSize[] = formatRows.map((r) => ({
      format: r.format.toUpperCase(),
      sizeBytes: Math.trunc(Number(r.uncompressed_size ?? 0)),
    }));

    const identifiers: BookIdentifier[] = identifierRows.map((r) => ({
      idType: r.type,
      value: r.val,
    }));

    const ratingRaw = row.rating;
    const rating =
      ratingRaw !== null && ratingRaw !== undefined && !Number.isNaN(Number(ratingRaw))
        ? Math.round(Number(ratingRaw))
        : null;

    return {
      id: row.id,
      title: row.title || "未命名书籍",
      authorSort: row.author_sort ?? "",
      authors,
      tags,
      series: row.series,
      seriesIndex,
      formats,
      hasCover: (row.has_cover ?? 0) !== 0,
      path: row.path ?? "",
      timestamp: row.timestamp,
      pubdate: row.pubdate,
      lastModified: row.last_modified,
      comment: row.comment,
      publisher: row.publisher,
      languages,
      rating,
      uuid: row.uuid,
      formatSizes,
      identifiers,
    } satisfies BookDetail;
  } finally {
    await db.closeAsync();
  }
}

/**
 * Reads a book file from a local Calibre library and returns raw bytes.
 *
 * Calibre stores files at: `{library.path}/{book.path}/{data.name}.{format_lower}`
 * where `data.name` comes from the `data` table (typically matches the book title).
 */
export async function readBookFileBytes(
  library: Library,
  calibreBookId: number,
  format: string
): Promise<Uint8Array> {
  const bookFile = await resolveBookFile(library, calibreBookId, format);
  return bookFile.bytes();
}

async function lookupBookFileLocation(
  library: Library,
  calibreBookId: number,
  format: string
): Promise<{ rowPath: string; fileName: string; segments: string[] }> {
  const metadataUri = await resolveMetadataUriForRead(library);
  if (!metadataUri) {
    throw new Error("metadata.db 不可用");
  }
  const db = await openDatabaseFromUri(metadataUri);

  try {
    const row = await db.getFirstAsync<{ path: string; name: string }>(
      "SELECT b.path, d.name FROM books b JOIN data d ON d.book = b.id WHERE b.id = ? AND UPPER(d.format) = ?",
      [calibreBookId, format.toUpperCase()]
    );

    if (!row) {
      throw new Error(`格式 ${format} 在书库中未找到 (bookId=${calibreBookId})`);
    }

    return {
      rowPath: row.path,
      fileName: `${row.name}.${format.toLowerCase()}`,
      segments: row.path.split("/").filter(Boolean),
    };
  } finally {
    await db.closeAsync();
  }
}

export async function getBookFormatPaths(
  library: Library,
  calibreBookId: number,
): Promise<{ format: string; relativePath: string }[]> {
  const metadataUri = await resolveMetadataUriForRead(library);
  if (!metadataUri) {
    return [];
  }
  const db = await openDatabaseFromUri(metadataUri);
  try {
    const rows = await db.getAllAsync<{ fmt: string; path: string; name: string }>(
      `SELECT UPPER(d.format) AS fmt, b.path, d.name
       FROM books b JOIN data d ON d.book = b.id WHERE b.id = ?`,
      [calibreBookId],
    );
    return rows.map((r) => ({
      format: r.fmt,
      relativePath: `${r.path}/${r.name}.${r.fmt.toLowerCase()}`,
    }));
  } finally {
    await db.closeAsync();
  }
}

/**
 * Returns every downloadable format path keyed by Calibre book id.
 */
export async function getLibraryBookFormatPathMap(
  library: Library,
): Promise<Record<string, string[]>> {
  const metadataUri = await resolveMetadataUriForRead(library);
  if (!metadataUri) {
    return {};
  }
  const db = await openDatabaseFromUri(metadataUri);
  try {
    const rows = await db.getAllAsync<{ book_id: number; fmt: string; path: string; name: string }>(
      `SELECT b.id AS book_id, UPPER(d.format) AS fmt, b.path, d.name
       FROM books b JOIN data d ON d.book = b.id`,
    );
    return rows.reduce<Record<string, string[]>>((mapped, row) => {
      const bookId = String(row.book_id);
      mapped[bookId] = mapped[bookId] ?? [];
      mapped[bookId].push(`${row.path}/${row.name}.${row.fmt.toLowerCase()}`);
      return mapped;
    }, {});
  } finally {
    await db.closeAsync();
  }
}

/**
 * Returns all readable formats keyed by Calibre book id.
 */
export async function getAllBookFormats(
  library: Library,
): Promise<Record<string, string[]>> {
  const metadataUri = await resolveMetadataUriForRead(library);
  if (!metadataUri) {
    return {};
  }
  const db = await openDatabaseFromUri(metadataUri);
  try {
    const rows = await db.getAllAsync<{ book_id: number; fmt: string }>(
      `SELECT b.id AS book_id, UPPER(d.format) AS fmt
       FROM books b JOIN data d ON d.book = b.id`,
    );
    return rows.reduce<Record<string, string[]>>((mapped, row) => {
      const bookId = String(row.book_id);
      mapped[bookId] = mapped[bookId] ?? [];
      if (!mapped[bookId].includes(row.fmt)) {
        mapped[bookId].push(row.fmt);
      }
      return mapped;
    }, {});
  } finally {
    await db.closeAsync();
  }
}

function createBookFile(rootUri: string, segments: string[], fileName: string) {
  return new FSFile(localCachedFileUri(rootUri, [...segments, fileName].join("/")));
}

function assertBookFileExists(
  bookFile: FSFile,
  libraryPath: string,
  rowPath: string,
  fileName: string
) {
  if (!bookFile.exists) {
    throw new Error(
      `书籍文件不存在: ${fileName}\n` +
        `完整路径: ${bookFile.uri}\n` +
        `书库路径: ${libraryPath}\n` +
        `书内路径: ${rowPath}`
    );
  }
}

function describeFileForLog(file: FSFile) {
  return {
    uri: file.uri,
    exists: file.exists,
    size: file.size ?? null,
    name: file.name ?? null,
    extension: file.extension ?? null,
    md5: file.md5 ?? null,
  };
}

export async function materializeBookFileToCache(
  library: Library,
  calibreBookId: number,
  format: string,
  cachePrefix = "local-book"
): Promise<FSFile> {
  const { rowPath, fileName, segments } = await lookupBookFileLocation(library, calibreBookId, format);
  ensureReaderCacheDirectories();
  const cacheDir = READER_LOCAL_COPY_CACHE_DIR;

  const ext = `.${format.toLowerCase()}`;
  const rand = Math.random().toString(36).slice(2, 10);
  const cacheName = `${cachePrefix}-${library.id}-${calibreBookId}-${Date.now()}-${rand}${ext}`;
  const cachedFile = new FSFile(cacheDir, cacheName);
  if (cachedFile.exists) {
    cachedFile.delete();
  }
  cachedFile.create({ overwrite: true, intermediates: true });

  console.info("[mobile-reader] calibre:materialize-cache:start", {
    libraryId: library.id,
    calibreBookId,
    format: format.toUpperCase(),
    cachePrefix,
    sourceType: library.sourceType ?? "local",
    hasSecurityScopedBookmark: Boolean(library.securityScopedBookmark),
    cacheFile: describeFileForLog(cachedFile),
    rowPath,
    segments,
  });

  if (Platform.OS === "ios" && library.securityScopedBookmark) {
    const { result: sourceBytes } = await withSecurityScopedLibraryAccess(library, async (resolvedPath) => {
      const sourceFile = createBookFile(resolvedPath, segments, fileName);
      assertBookFileExists(sourceFile, resolvedPath, rowPath, fileName);
      console.info("[mobile-reader] calibre:materialize-cache:source-ios", {
        libraryId: library.id,
        calibreBookId,
        resolvedPath,
        sourceFile: describeFileForLog(sourceFile),
      });
      return sourceFile.bytes();
    });

    console.info("[mobile-reader] calibre:materialize-cache:bytes-ios", {
      libraryId: library.id,
      calibreBookId,
      byteLength: sourceBytes.byteLength,
      cacheFileBeforeWrite: describeFileForLog(cachedFile),
    });

    cachedFile.write(sourceBytes);

    console.info("[mobile-reader] calibre:materialize-cache:done-ios", {
      libraryId: library.id,
      calibreBookId,
      cacheFile: describeFileForLog(cachedFile),
    });
    return cachedFile;
  }

  const sourceFile = createBookFile(library.path, segments, fileName);
  assertBookFileExists(sourceFile, library.path, rowPath, fileName);
  console.info("[mobile-reader] calibre:materialize-cache:source-local", {
    libraryId: library.id,
    calibreBookId,
    sourceFile: describeFileForLog(sourceFile),
  });
  sourceFile.copy(cachedFile);
  console.info("[mobile-reader] calibre:materialize-cache:done-local", {
    libraryId: library.id,
    calibreBookId,
    cacheFile: describeFileForLog(cachedFile),
  });
  return cachedFile;
}

/**
 * Removes cached local-copy files related to a library.
 */
export function clearLocalCopyCacheByLibrary(libraryId: string): void {
  ensureReaderCacheDirectories();
  if (!READER_LOCAL_COPY_CACHE_DIR.exists) return;
  const prefix = `-${libraryId}-`;
  for (const entry of READER_LOCAL_COPY_CACHE_DIR.list()) {
    if (!(entry instanceof FSFile)) continue;
    if (entry.name?.includes(prefix)) {
      entry.delete();
    }
  }
}

export async function resolveBookFile(
  library: Library,
  calibreBookId: number,
  format: string
): Promise<FSFile> {
  const { rowPath, fileName, segments } = await lookupBookFileLocation(library, calibreBookId, format);

  if (library.securityScopedBookmark) {
    const { result: bookFile, refreshedLibrary } = await withSecurityScopedLibraryAccess(
      library,
      async (resolvedPath) => createBookFile(resolvedPath, segments, fileName)
    );

    const effectiveLibrary = refreshedLibrary ?? library;
    assertBookFileExists(bookFile, effectiveLibrary.path, rowPath, fileName);
    return bookFile;
  }

  const bookFile = createBookFile(library.path, segments, fileName);
  assertBookFileExists(bookFile, library.path, rowPath, fileName);
  return bookFile;
}

export async function readBooksFromLibrary(library: Library): Promise<BookItem[]> {
  const metadataUri = await resolveMetadataUriForRead(library);
  if (!metadataUri) {
    return [];
  }
  const db = await openDatabaseFromUri(metadataUri);

  try {
    const rows = await db.getAllAsync<RawBookRow>(BOOKS_QUERY);

    if (library.securityScopedBookmark) {
      const { result: coverRootPath, refreshedLibrary } = await withSecurityScopedLibraryAccess(
        library,
        async (resolvedPath) => resolvedPath
      );
      const effectiveLibrary = refreshedLibrary ?? library;

      return rows.map((row) => {
        const authors = splitConcat(row.authors);

        return {
          id: `${row.id}`,
          calibreId: row.id,
          title: row.title || "未命名书籍",
          author: authors[0] || row.author_sort || "未知作者",
          authors,
          path: row.path || undefined,
          hasCover: (row.has_cover ?? 0) !== 0,
          timestamp: row.timestamp,
          coverUri: buildCoverUri(
            effectiveLibrary,
            row.path,
            (row.has_cover ?? 0) !== 0,
            coverRootPath
          ),
        } satisfies BookItem;
      });
    }

    return rows.map((row) => {
      const authors = splitConcat(row.authors);

      return {
        id: `${row.id}`,
        calibreId: row.id,
        title: row.title || "未命名书籍",
        author: authors[0] || row.author_sort || "未知作者",
        authors,
        path: row.path || undefined,
        hasCover: (row.has_cover ?? 0) !== 0,
        timestamp: row.timestamp,
        coverUri: buildCoverUri(
          library,
          row.path,
          (row.has_cover ?? 0) !== 0
        ),
      } satisfies BookItem;
    });
  } finally {
    await db.closeAsync();
  }
}
