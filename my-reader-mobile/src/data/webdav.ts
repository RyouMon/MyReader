import { File, Paths } from "expo-file-system";

import type { BookItem, MobileLibrary, WebDavDataSource } from "./types";
import { openDatabaseFromUri } from "./sqlite";
import { canonicalRelativePath, encodeUrlPathFromChunks } from "../utils/io";
import { showAlertWithStatusBarRestore } from "../constants/alert-with-status-bar";

export function buildWebDavBookCoverUri(
  library: MobileLibrary,
  source: WebDavDataSource,
  bookPath: string,
  hasCover: boolean
): BookItem["coverUri"] | undefined {
  if (!bookPath || !hasCover) {
    return undefined;
  }

  const remoteCoverPath = `${library.sourcePath ?? library.path}/${bookPath}/cover.jpg`;

  return {
    uri: buildUrl(source, remoteCoverPath),
    headers: buildAuthHeader(source),
  };
}

type WebDavEntry = {
  href: string;
  name: string;
  isDirectory: boolean;
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

function encodeBasicAuth(username: string, password: string) {
  if (typeof globalThis.btoa === "function") {
    return globalThis.btoa(`${username}:${password}`);
  }

  throw new Error("当前环境不支持 Basic Auth 编码");
}

function normalizeBaseUrl(url: string) {
  return url.trim().replace(/\/+$/, "");
}

function normalizeRemotePath(path: string) {
  const trimmed = path.trim();
  if (!trimmed || trimmed === "/") {
    return "";
  }

  return `/${trimmed.replace(/^\/+/, "").replace(/\/+$/, "")}`;
}

function normalizeHrefPath(href: string) {
  const trimmed = href.trim();

  if (!trimmed) {
    return "";
  }

  let pathname = trimmed;
  try {
    pathname = new URL(trimmed).pathname;
  } catch {
    pathname = trimmed;
  }

  const plain = canonicalRelativePath(pathname);
  return plain ? `/${plain}` : "/";
}

function buildUrl(source: WebDavDataSource, path = "") {
  const baseUrl = normalizeBaseUrl(source.endpoint);
  const encodedPath = encodeUrlPathFromChunks(source.rootPath ?? "", path);
  return encodedPath ? `${baseUrl}/${encodedPath}` : baseUrl;
}

function buildAuthHeader(source: WebDavDataSource) {
  return {
    Authorization: `Basic ${encodeBasicAuth(source.username, source.password)}`,
  };
}

function splitConcat(value: string | null) {
  return value ? value.split("||").filter(Boolean) : [];
}

function extractTagValue(xml: string, tag: string) {
  const match = xml.match(new RegExp(`<[^>]*${tag}[^>]*>([\\s\\S]*?)</[^>]*${tag}>`, "i"));
  return match?.[1]?.trim() ?? "";
}

function decodeXml(text: string) {
  return text
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

function toRemoteEntryPath(source: WebDavDataSource, href: string, isDirectory: boolean) {
  const normalizedPath = normalizeHrefPath(href).replace(/\/+$/, isDirectory ? "/" : "");
  const basePath = normalizeRemotePath(source.rootPath ?? "");
  const expectedPrefix = `${basePath}/`.replace(/\/+/g, "/");

  if (!normalizedPath) {
    return "";
  }

  if (!basePath) {
    return normalizedPath === "/" ? "" : normalizedPath.replace(/\/+$/, isDirectory ? "/" : "");
  }

  if (normalizedPath === basePath || normalizedPath === `${basePath}/`) {
    return "";
  }

  if (normalizedPath.startsWith(expectedPrefix)) {
    const relativePath = normalizedPath.slice(basePath.length);
    return normalizeRemotePath(relativePath).replace(/\/+$/, isDirectory ? "/" : "");
  }

  return normalizeRemotePath(normalizedPath).replace(/\/+$/, isDirectory ? "/" : "");
}

function parsePropfind(source: WebDavDataSource, xml: string): WebDavEntry[] {
  const responses = xml.match(/<[^>]*response[^>]*>[\s\S]*?<\/[^>]*response>/gi) ?? [];

  return responses
    .map((chunk) => {
      const href = decodeXml(extractTagValue(chunk, "href"));
      const displayName = decodeXml(extractTagValue(chunk, "displayname"));
      const isDirectory = /<[^>]*collection\s*\/?>/i.test(chunk);
      const remotePath = toRemoteEntryPath(source, href, isDirectory);
      const fallbackName = remotePath.split("/").filter(Boolean).at(-1) ?? href;

      return {
        href: remotePath,
        name: displayName || fallbackName,
        isDirectory,
      } satisfies WebDavEntry;
    })
    .filter((entry) => entry.href);
}

async function requestWebDav(source: WebDavDataSource, path: string, init?: RequestInit) {
  const response = await fetch(buildUrl(source, path), {
    ...init,
    headers: {
      ...buildAuthHeader(source),
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(`WebDAV 请求失败: ${response.status}`);
  }

  return response;
}

export async function testWebDavConnection(source: WebDavDataSource) {
  await requestWebDav(source, "", { method: "PROPFIND", headers: { Depth: "0" } });
}

export async function listWebDavDirectory(source: WebDavDataSource, path = "") {
  const response = await requestWebDav(source, path, {
    method: "PROPFIND",
    headers: {
      Depth: "1",
      "Content-Type": "application/xml; charset=utf-8",
    },
    // Ask for allprop to stay compatible with servers that reject specific DAV properties.
    body: `<?xml version="1.0" encoding="utf-8" ?><d:propfind xmlns:d="DAV:"><d:allprop /></d:propfind>`,
  });

  const xml = await response.text();
  const currentPath = normalizeRemotePath(path).replace(/\/+$/, "");

  return parsePropfind(source, xml).filter((entry) => {
    const href = entry.href.replace(/\/+$/, "");
    return href !== currentPath;
  }).sort((left, right) => {
    if (left.isDirectory !== right.isDirectory) {
      return left.isDirectory ? -1 : 1;
    }

    return left.name.localeCompare(right.name, "zh-CN");
  });
}

async function downloadToCache(source: WebDavDataSource, remotePath: string, localName: string) {
  const response = await requestWebDav(source, remotePath);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const file = new File(Paths.cache, localName);

  if (!file.exists) {
    file.create({ intermediates: true, overwrite: true });
  }

  file.write(bytes);
  return file;
}

/**
 * Ensures WebDAV metadata.db exists in current sandbox cache, re-downloading when missing.
 */
async function ensureWebDavMetadataCached(
  library: MobileLibrary,
  source: WebDavDataSource,
): Promise<string | null> {
  const existingMetadata = new File(library.metadataUri);
  if (existingMetadata.exists) {
    return existingMetadata.uri;
  }

  try {
    const remoteBase = normalizeRemotePath(library.sourcePath ?? library.path);
    const metadataFile = await downloadToCache(
      source,
      `${remoteBase}/metadata.db`,
      `webdav-${library.id}-metadata.db`,
    );
    return metadataFile.uri;
  } catch {
    showAlertWithStatusBarRestore(
      "书库数据已损坏",
      "无法恢复该书库的 metadata.db。请删除当前书库并重新添加后再试。",
      [{ text: "知道了" }],
    );
    return null;
  }
}

export async function createWebDavLibraryFromPath(
  source: WebDavDataSource,
  remoteLibraryPath: string
): Promise<MobileLibrary> {
  const normalizedPath = normalizeRemotePath(remoteLibraryPath);
  const metadataFile = await downloadToCache(
    source,
    `${normalizedPath}/metadata.db`,
    `webdav-${source.id}-${Date.now()}-metadata.db`
  );

  const db = await openDatabaseFromUri(metadataFile.uri);

  try {
    const row = await db.getFirstAsync<{ count: number }>("SELECT COUNT(*) as count FROM books");
    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      name: normalizedPath.split("/").filter(Boolean).at(-1) ?? source.name,
      path: normalizedPath,
      metadataUri: metadataFile.uri,
      bookCount: row ? Number(row.count) : 0,
      addedAt: Date.now(),
      dataSourceId: source.id,
      sourceType: "webdav",
      sourcePath: normalizedPath,
    };
  } finally {
    await db.closeAsync();
  }
}

export async function readBooksFromWebDavLibrary(
  library: MobileLibrary,
  source: WebDavDataSource
): Promise<{ books: BookItem[]; metadataUri: string }> {
  const metadataUri = await ensureWebDavMetadataCached(library, source);
  if (!metadataUri) {
    return {
      books: [],
      metadataUri: library.metadataUri,
    };
  }
  const db = await openDatabaseFromUri(metadataUri);

  try {
    const rows = await db.getAllAsync<RawBookRow>(BOOKS_QUERY);

    return {
      metadataUri,
      books: rows.map((row) => {
      const authors = splitConcat(row.authors);
      const remoteCoverPath = row.path && (row.has_cover ?? 0) !== 0
        ? `${library.sourcePath ?? library.path}/${row.path}/cover.jpg`
        : undefined;

      return {
        id: `${row.id}`,
        calibreId: row.id,
        title: row.title || "未命名书籍",
        author: authors[0] || row.author_sort || "未知作者",
        authors,
        path: row.path || undefined,
        hasCover: (row.has_cover ?? 0) !== 0,
        timestamp: row.timestamp,
        coverUri: remoteCoverPath
          ? {
              uri: buildUrl(source, remoteCoverPath),
              headers: buildAuthHeader(source),
            }
          : undefined,
      } satisfies BookItem;
      }),
    };
  } finally {
    await db.closeAsync();
  }
}
