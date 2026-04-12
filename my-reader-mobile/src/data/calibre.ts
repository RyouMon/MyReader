import * as DocumentPicker from "expo-document-picker";
import { Directory, File as FSFile, Paths } from "expo-file-system";
import * as SQLite from "expo-sqlite";
import { Platform } from "react-native";

import type { BookDetail, BookIdentifier, FormatSize } from "my-reader-tools/types/book";

import {
  createSecurityScopedBookmark,
  withSecurityScopedLibraryAccess,
} from "./security-scoped-bookmarks";
import type { BookItem, MobileLibrary } from "./types";

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

async function refreshCachedMetadataFromDirectory(library: MobileLibrary, directoryUri: string) {
  const metadataFile = getMetadataFileFromDirectory({ uri: directoryUri });

  if (!metadataFile) {
    throw new Error("所选书库中未找到 metadata.db，请确认仍是有效的 Calibre 书库");
  }

  return copyMetadataToCache(metadataFile.uri, library.id);
}

function getLibraryRootUri(library: MobileLibrary, resolvedPath?: string) {
  return resolvedPath ?? library.securityScopedBookmark?.resolvedUri ?? library.path;
}

export function buildCoverUri(
  library: MobileLibrary,
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

async function pickMetadataFileFallback() {
  const result = await DocumentPicker.getDocumentAsync({
    type: "*/*",
    copyToCacheDirectory: true,
    multiple: false,
  });

  if (result.canceled || !result.assets?.[0]) {
    return null;
  }

  const asset = result.assets[0];
  if (asset.name !== "metadata.db") {
    throw new Error("请选择 Calibre 书库中的 metadata.db 文件");
  }

  const file = new FSFile(asset.uri);

  return {
    directory: file.parentDirectory,
    metadataFile: file,
  };
}

export async function pickCalibreLibrary(): Promise<MobileLibrary> {
  let directory: PickedDirectoryLike | null = null;
  let metadataFile: FSFile | null = null;

  if (Platform.OS !== "web") {
    try {
      directory = await Directory.pickDirectoryAsync();
    } catch {
      throw new Error("已取消选择书库");
    }
    metadataFile = getMetadataFileFromDirectory(directory);
  }

  const needsMetadataFilePicker =
    Platform.OS === "web" || (directory !== null && !metadataFile);

  if (needsMetadataFilePicker) {
    const fallback = await pickMetadataFileFallback();

    if (!fallback) {
      throw new Error("已取消选择书库");
    }

    directory = fallback.directory;
    metadataFile = fallback.metadataFile;
  }

  if (!metadataFile || directory === null) {
    throw new Error("所选目录中未找到 metadata.db，请选择 Calibre 书库根目录");
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

export async function ensureLibraryMetadataCached(library: MobileLibrary): Promise<MobileLibrary> {
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

  if (isCachedMetadataUri(library.metadataUri)) {
    return library;
  }

  const cachedMetadataUri = copyMetadataToCache(library.metadataUri, library.id);

  return {
    ...library,
    metadataUri: cachedMetadataUri,
  };
}

export async function readBookCountFromLibrary(library: MobileLibrary) {
  const nextLibrary = await ensureLibraryMetadataCached(library);
  const bookCount = await readBookCountFromMetadata(nextLibrary.metadataUri);

  return {
    library: {
      ...nextLibrary,
      bookCount,
    },
    bookCount,
  };
}

export async function readBookCountFromMetadata(metadataUri: string) {
  const metadataFile = new FSFile(metadataUri);
  const bytes = await metadataFile.bytes();
  const db = await SQLite.deserializeDatabaseAsync(bytes);

  try {
    const row = await db.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) as count FROM books"
    );
    return row?.count ?? 0;
  } finally {
    await db.closeAsync();
  }
}

export async function readBookDetailFromMetadata(
  library: MobileLibrary,
  calibreBookId: number
): Promise<BookDetail | null> {
  const metadataFile = new FSFile(library.metadataUri);
  const bytes = await metadataFile.bytes();
  const db = await SQLite.deserializeDatabaseAsync(bytes);

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
  library: MobileLibrary,
  calibreBookId: number,
  format: string
): Promise<Uint8Array> {
  const bookFile = await resolveBookFile(library, calibreBookId, format);
  return bookFile.bytes();
}

export async function resolveBookFile(
  library: MobileLibrary,
  calibreBookId: number,
  format: string
): Promise<FSFile> {
  const metadataFile = new FSFile(library.metadataUri);
  const metadataBytes = await metadataFile.bytes();
  const db = await SQLite.deserializeDatabaseAsync(metadataBytes);

  try {
    const row = await db.getFirstAsync<{ path: string; name: string }>(
      "SELECT b.path, d.name FROM books b JOIN data d ON d.book = b.id WHERE b.id = ? AND UPPER(d.format) = ?",
      [calibreBookId, format.toUpperCase()]
    );

    if (!row) {
      throw new Error(`格式 ${format} 在书库中未找到 (bookId=${calibreBookId})`);
    }

    const segments = row.path.split("/").filter(Boolean);
    const fileName = `${row.name}.${format.toLowerCase()}`;

    const buildBookFile = (rootUri: string) =>
      new FSFile(new Directory(rootUri), ...segments, fileName);

    if (library.securityScopedBookmark) {
      const { result: bookFile, refreshedLibrary } = await withSecurityScopedLibraryAccess(
        library,
        async (resolvedPath) => buildBookFile(resolvedPath)
      );

      const effectiveLibrary = refreshedLibrary ?? library;
      if (!bookFile.exists) {
        throw new Error(
          `书籍文件不存在: ${fileName}\n` +
            `完整路径: ${bookFile.uri}\n` +
            `书库路径: ${effectiveLibrary.path}\n` +
            `书内路径: ${row.path}`
        );
      }

      return bookFile;
    }

    const bookFile = buildBookFile(library.path);

    if (!bookFile.exists) {
      throw new Error(
        `书籍文件不存在: ${fileName}\n` +
          `完整路径: ${bookFile.uri}\n` +
          `书库路径: ${library.path}\n` +
          `书内路径: ${row.path}`
      );
    }

    return bookFile;
  } finally {
    await db.closeAsync();
  }
}

export async function readBooksFromLibrary(library: MobileLibrary): Promise<BookItem[]> {
  const metadataFile = new FSFile(library.metadataUri);
  const bytes = await metadataFile.bytes();
  const db = await SQLite.deserializeDatabaseAsync(bytes);

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
