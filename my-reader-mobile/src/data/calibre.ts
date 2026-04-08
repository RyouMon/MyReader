import * as DocumentPicker from "expo-document-picker";
import { Directory, File as FSFile, Paths } from "expo-file-system";
import * as SQLite from "expo-sqlite";
import { Platform } from "react-native";

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

function buildCoverUri(
  library: MobileLibrary,
  bookPath: string | null,
  hasCover: boolean
) {
  if (!bookPath || !hasCover) {
    return undefined;
  }

  const segments = bookPath.split("/").filter(Boolean);
  const coverFile = new FSFile(
    new Directory(library.path),
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
      metadataFile = getMetadataFileFromDirectory(directory);
    } catch {
      directory = null;
      metadataFile = null;
    }
  }

  if (!directory || !metadataFile) {
    const fallback = await pickMetadataFileFallback();

    if (!fallback) {
      throw new Error("已取消选择书库");
    }

    directory = fallback.directory;
    metadataFile = fallback.metadataFile;
  }

  if (!metadataFile) {
    throw new Error("所选目录中未找到 metadata.db，请选择 Calibre 书库根目录");
  }

  const id = createId();
  const cachedMetadataUri = copyMetadataToCache(metadataFile.uri, id);
  const bookCount = await readBookCountFromMetadata(cachedMetadataUri);

  return {
    id,
    name: directory.name || new Directory(directory.uri).name || "未命名书库",
    path: directory.uri,
    metadataUri: cachedMetadataUri,
    bookCount,
    addedAt: Date.now(),
  };
}

export async function ensureLibraryMetadataCached(library: MobileLibrary): Promise<MobileLibrary> {
  if (library.sourceType === "webdav" || isCachedMetadataUri(library.metadataUri)) {
    return library;
  }

  const cachedMetadataUri = copyMetadataToCache(library.metadataUri, library.id);

  return {
    ...library,
    metadataUri: cachedMetadataUri,
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

export async function readBooksFromLibrary(library: MobileLibrary): Promise<BookItem[]> {
  const metadataFile = new FSFile(library.metadataUri);
  const bytes = await metadataFile.bytes();
  const db = await SQLite.deserializeDatabaseAsync(bytes);

  try {
    const rows = await db.getAllAsync<RawBookRow>(BOOKS_QUERY);

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
