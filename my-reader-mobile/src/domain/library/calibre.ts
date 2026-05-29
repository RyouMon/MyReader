import { Directory, File as FSFile, Paths } from "expo-file-system";
import { Platform } from "react-native";
import { eq, and, sql } from "drizzle-orm";

import type { BookDetail, BookIdentifier, FormatSize } from "@my-reader/tools/types/book";
import {
  books,
  authors,
  booksAuthorsLink,
  tags,
  booksTagsLink,
  series,
  booksSeriesLink,
  data,
  comments,
  publishers,
  booksPublishersLink,
  languages,
  booksLanguagesLink,
  ratings,
  booksRatingsLink,
  identifiers,
} from "@my-reader/db/schema/calibre";
import i18n from "@/src/i18n";
import { showAlertWithStatusBarRestore } from "../../constants/alert-with-status-bar";

import {
  createSecurityScopedBookmark,
  withSecurityScopedLibraryAccess,
} from "../../services/fs/bookmarks";
import type { BookItem, Library } from "../types";
import { isRemoteSourceType } from "../types";
import {
  READER_LOCAL_COPY_CACHE_DIR,
  ensureReaderCacheDirectories,
} from "../../services/fs/cache";
import { openCalibreDatabase } from "../../services/db/calibre-db";
import { localCachedFileUri } from "../../services/fs/path";

type PickedDirectoryLike = {
  uri: string;
  name?: string;
  list?: () => unknown[];
};

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
    throw new Error(i18n.t("sync.notValidCalibreLibrary"));
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
  } catch {
    return null;
  }

  if (directory == null) {
    return null;
  }

  metadataFile = getMetadataFileFromDirectory(directory);

  if (!metadataFile) {
    showAlertWithStatusBarRestore(
      i18n.t("sync.metadataNotFound"),
      i18n.t("sync.metadataNotFoundDetail"),
      [{ text: i18n.t("common.gotIt") }]
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
    name: libraryRoot.name || new Directory(libraryRoot.uri).name || i18n.t("common.unnamedLibrary"),
    path: resolvedPath,
    metadataUri: cachedMetadataUri,
    bookCount,
    addedAt: Date.now(),
    securityScopedBookmark: securityScopedBookmark ?? undefined,
  };
}

export async function ensureLibraryMetadataCached(library: Library): Promise<Library> {
  if (isRemoteSourceType(library.sourceType)) {
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

export async function forceRefreshLibraryMetadata(library: Library): Promise<Library> {
  if (isRemoteSourceType(library.sourceType)) {
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

async function resolveMetadataUriForRead(library: Library): Promise<string | null> {
  if (isRemoteSourceType(library.sourceType)) {
    if (!library.metadataUri) {
      return null;
    }
    const currentMetadata = new FSFile(library.metadataUri);
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
      i18n.t("sync.corruptedLibrary"),
      i18n.t("sync.corruptedLibraryMessage"),
      [{ text: i18n.t("common.gotIt") }],
    );
    return null;
  }
}

export async function readBookCountFromMetadata(metadataUri: string) {
  const handle = openCalibreDatabase(metadataUri);

  try {
    const result = await handle.db
      .select({ count: sql<number>`count(*)` })
      .from(books)
      .get();
    return result ? Number(result.count) : 0;
  } finally {
    await handle.raw.closeAsync();
  }
}

/**
 * Fetches all related data for a single book and assembles a BookDetail.
 * Each relation is a simple query — no GROUP_CONCAT or sub-selects.
 */
export async function readBookDetailFromMetadata(
  library: Library,
  calibreBookId: number
): Promise<BookDetail | null> {
  const metadataUri = await resolveMetadataUriForRead(library);
  if (!metadataUri) {
    return null;
  }
  const handle = openCalibreDatabase(metadataUri);

  try {
    // 1. Main book row
    const book = await handle.db
      .select()
      .from(books)
      .where(eq(books.id, calibreBookId))
      .get();

    if (!book) {
      return null;
    }

    // 2. Authors via link table
    const authorRows = await handle.db
      .select({ name: authors.name })
      .from(booksAuthorsLink)
      .innerJoin(authors, eq(authors.id, booksAuthorsLink.author))
      .where(eq(booksAuthorsLink.book, calibreBookId))
      .all();

    // 3. Tags via link table
    const tagRows = await handle.db
      .select({ name: tags.name })
      .from(booksTagsLink)
      .innerJoin(tags, eq(tags.id, booksTagsLink.tag))
      .where(eq(booksTagsLink.book, calibreBookId))
      .all();

    // 4. Series via link table (at most one)
    const seriesRow = await handle.db
      .select({ name: series.name })
      .from(booksSeriesLink)
      .innerJoin(series, eq(series.id, booksSeriesLink.series))
      .where(eq(booksSeriesLink.book, calibreBookId))
      .get();

    // 5. Formats from data table
    const formatRows = await handle.db
      .select({
        format: data.format,
        uncompressedSize: data.uncompressedSize,
      })
      .from(data)
      .where(eq(data.book, calibreBookId))
      .orderBy(data.format)
      .all();

    // 6. Comment (at most one)
    const commentRow = await handle.db
      .select({ text: comments.text })
      .from(comments)
      .where(eq(comments.book, calibreBookId))
      .get();

    // 7. Publisher via link table (at most one)
    const publisherRow = await handle.db
      .select({ name: publishers.name })
      .from(booksPublishersLink)
      .innerJoin(publishers, eq(publishers.id, booksPublishersLink.publisher))
      .where(eq(booksPublishersLink.book, calibreBookId))
      .get();

    // 8. Languages via link table
    const languageRows = await handle.db
      .select({ langCode: languages.langCode })
      .from(booksLanguagesLink)
      .innerJoin(languages, eq(languages.id, booksLanguagesLink.langCode))
      .where(eq(booksLanguagesLink.book, calibreBookId))
      .all();

    // 9. Rating via link table (at most one)
    const ratingRow = await handle.db
      .select({ rating: ratings.rating })
      .from(booksRatingsLink)
      .innerJoin(ratings, eq(ratings.id, booksRatingsLink.rating))
      .where(eq(booksRatingsLink.book, calibreBookId))
      .get();

    // 10. Identifiers
    const identifierRows = await handle.db
      .select({
        type: identifiers.type,
        val: identifiers.val,
      })
      .from(identifiers)
      .where(eq(identifiers.book, calibreBookId))
      .orderBy(identifiers.type)
      .all();

    // Assemble
    const bookAuthors = authorRows.map((r) => r.name ?? "").filter(Boolean);
    const bookTags = tagRows.map((r) => r.name ?? "").filter(Boolean);
    const bookLanguages = languageRows.map((r) => r.langCode ?? "").filter(Boolean);
    const formats = formatRows.map((r) => (r.format ?? "").toUpperCase());

    const seriesIndexRaw = book.seriesIndex;
    const seriesIndex =
      seriesIndexRaw !== null && seriesIndexRaw !== undefined && !Number.isNaN(Number(seriesIndexRaw))
        ? Number(seriesIndexRaw)
        : null;

    const formatSizes: FormatSize[] = formatRows.map((r) => ({
      format: (r.format ?? "").toUpperCase(),
      sizeBytes: Math.trunc(Number(r.uncompressedSize ?? 0)),
    }));

    const bookIdentifiers: BookIdentifier[] = identifierRows.map((r) => ({
      idType: r.type ?? "isbn",
      value: r.val,
    }));

    const ratingRaw = ratingRow?.rating;
    const rating =
      ratingRaw !== null && ratingRaw !== undefined && !Number.isNaN(Number(ratingRaw))
        ? Math.round(Number(ratingRaw))
        : null;

    return {
      id: book.id,
      title: book.title || i18n.t("common.unnamedBook"),
      authorSort: book.authorSort ?? "",
      authors: bookAuthors,
      tags: bookTags,
      series: seriesRow?.name ?? null,
      seriesIndex,
      formats,
      hasCover: (book.hasCover ?? 0) !== 0,
      path: book.path ?? "",
      timestamp: book.timestamp,
      pubdate: book.pubdate,
      lastModified: book.lastModified,
      comment: commentRow?.text ?? null,
      publisher: publisherRow?.name ?? null,
      languages: bookLanguages,
      rating,
      uuid: book.uuid,
      formatSizes,
      identifiers: bookIdentifiers,
    } satisfies BookDetail;
  } finally {
    await handle.raw.closeAsync();
  }
}

async function lookupBookFileLocation(
  library: Library,
  calibreBookId: number,
  format: string
): Promise<{ rowPath: string; fileName: string; segments: string[] }> {
  const metadataUri = await resolveMetadataUriForRead(library);
  if (!metadataUri) {
    throw new Error(i18n.t("sync.metadataDbNotAvailable"));
  }
  const handle = openCalibreDatabase(metadataUri);

  try {
    const row = await handle.db
      .select({
        path: books.path,
        name: data.name,
      })
      .from(books)
      .innerJoin(data, eq(data.book, books.id))
      .where(and(eq(books.id, calibreBookId), sql`UPPER(${data.format}) = ${format.toUpperCase()}`))
      .get();

    if (!row) {
      throw new Error(i18n.t("sync.formatNotFoundInLibrary", { format, id: calibreBookId }));
    }

    return {
      rowPath: row.path ?? "",
      fileName: `${row.name}.${format.toLowerCase()}`,
      segments: (row.path ?? "").split("/").filter(Boolean),
    };
  } finally {
    await handle.raw.closeAsync();
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
  const handle = openCalibreDatabase(metadataUri);
  try {
    const bookPathRow = await handle.db
      .select({ path: books.path })
      .from(books)
      .where(eq(books.id, calibreBookId))
      .get();

    if (!bookPathRow?.path) {
      return [];
    }

    const formatRows = await handle.db
      .select({
        format: data.format,
        name: data.name,
      })
      .from(data)
      .where(eq(data.book, calibreBookId))
      .all();

    return formatRows.map((r) => ({
      format: (r.format ?? "").toUpperCase(),
      relativePath: `${bookPathRow.path}/${r.name}.${(r.format ?? "").toLowerCase()}`,
    }));
  } finally {
    await handle.raw.closeAsync();
  }
}

export async function getAllBookFormats(
  library: Library,
): Promise<Record<string, string[]>> {
  const metadataUri = await resolveMetadataUriForRead(library);
  if (!metadataUri) {
    return {};
  }
  const handle = openCalibreDatabase(metadataUri);
  try {
    const rows = await handle.db
      .select({
        bookId: data.book,
        fmt: data.format,
      })
      .from(data)
      .all();

    return rows.reduce<Record<string, string[]>>((mapped, row) => {
      const bookIdKey = String(row.bookId);
      mapped[bookIdKey] = mapped[bookIdKey] ?? [];
      const upper = (row.fmt ?? "").toUpperCase();
      if (!mapped[bookIdKey].includes(upper)) {
        mapped[bookIdKey].push(upper);
      }
      return mapped;
    }, {});
  } finally {
    await handle.raw.closeAsync();
  }
}

function createBookFile(rootUri: string, segments: string[], fileName: string) {
  return new FSFile(localCachedFileUri(rootUri, [...segments, fileName].join("/")));
}

function assertBookFileExists(
  bookFile: FSFile,
  libraryPath: string,
  rowPath: string,
) {
  if (!bookFile.exists) {
    throw new Error(
      i18n.t("sync.bookFileNotFoundDetail", { uri: bookFile.uri, libraryPath, rowPath })
    );
  }
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
  // For the iOS bytes-write path, we need an empty file to write into.
  // For the local copy path, File.copy() requires the destination to NOT exist.
  // So we only create the file for the bytes-write path (iOS security-scoped).
  // The local path will skip this and let copy() create the file.

  if (Platform.OS === "ios" && library.securityScopedBookmark) {
    cachedFile.create({ intermediates: true });
    const { result: sourceBytes } = await withSecurityScopedLibraryAccess(library, async (resolvedPath) => {
      const sourceFile = createBookFile(resolvedPath, segments, fileName);
      assertBookFileExists(sourceFile, resolvedPath, rowPath);
      return sourceFile.bytes();
    });

    cachedFile.write(sourceBytes);

    return cachedFile;
  }

  const sourceFile = createBookFile(library.path, segments, fileName);
  assertBookFileExists(sourceFile, library.path, rowPath);
  sourceFile.copy(cachedFile);
  return cachedFile;
}

export async function readBooksFromLibrary(library: Library): Promise<BookItem[]> {
  const metadataUri = await resolveMetadataUriForRead(library);
  if (!metadataUri) {
    return [];
  }
  const handle = openCalibreDatabase(metadataUri);

  try {
    // 1. All books (main table only)
    const bookRows = await handle.db
      .select({
        id: books.id,
        title: books.title,
        authorSort: books.authorSort,
        path: books.path,
        hasCover: books.hasCover,
        timestamp: books.timestamp,
      })
      .from(books)
      .orderBy(sql`${books.sort} COLLATE NOCASE ASC`)
      .all();

    if (bookRows.length === 0) {
      return [];
    }

    // 2. All author links + author names
    const authorLinks = await handle.db
      .select({ book: booksAuthorsLink.book, name: authors.name })
      .from(booksAuthorsLink)
      .innerJoin(authors, eq(authors.id, booksAuthorsLink.author))
      .all();

    // Build bookId -> author names map
    const authorMap = new Map<number, string[]>();
    for (const link of authorLinks) {
      const list = authorMap.get(link.book) ?? [];
      if (link.name) {
        list.push(link.name);
      }
      authorMap.set(link.book, list);
    }

    // 3. Assemble BookItem[]
    const mapRow = (row: typeof bookRows[number]) => {
      const bookAuthors = authorMap.get(row.id) ?? [];

      return {
        id: `${row.id}`,
        calibreId: row.id,
        title: row.title || i18n.t("common.unnamedBook"),
        author: bookAuthors[0] || row.authorSort || i18n.t("common.unknownAuthor"),
        authors: bookAuthors,
        path: row.path || undefined,
        hasCover: (row.hasCover ?? 0) !== 0,
        timestamp: row.timestamp,
      };
    };

    if (library.securityScopedBookmark) {
      const { result: coverRootPath, refreshedLibrary } = await withSecurityScopedLibraryAccess(
        library,
        async (resolvedPath) => resolvedPath
      );
      const effectiveLibrary = refreshedLibrary ?? library;

      return bookRows.map((row) => ({
        ...mapRow(row),
        coverUri: buildCoverUri(
          effectiveLibrary,
          row.path,
          (row.hasCover ?? 0) !== 0,
          coverRootPath
        ),
      } satisfies BookItem));
    }

    return bookRows.map((row) => ({
      ...mapRow(row),
      coverUri: buildCoverUri(
        library,
        row.path,
        (row.hasCover ?? 0) !== 0
      ),
    } satisfies BookItem));
  } finally {
    await handle.raw.closeAsync();
  }
}