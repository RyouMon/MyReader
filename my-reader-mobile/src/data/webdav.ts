import { File, Paths } from "expo-file-system";
import ky from "ky";

import { canonicalRelativePath } from "../services/fs/path";
import { WebDavUrlBuilder } from "../services/webdav/url-builder";
import type { RemoteLibraryOps } from "./remote-library";
import type { RemoteBackendAdapter } from "./remote-library-shared";
import { createLibraryFromPath, readBooks, forceRefreshMetadata as sharedForceRefresh } from "./remote-library-shared";
import type { BookItem, Library, WebDavDataSource } from "./types";

// -- WebDAV URL helpers --

function buildUrl(source: WebDavDataSource, path = "") {
  return new WebDavUrlBuilder(source).urlFor(path);
}

function buildAuthHeader(source: WebDavDataSource): Record<string, string> {
  return new WebDavUrlBuilder(source).authHeaders;
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

// -- XML parsing helpers --

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

function parsePropfind(source: WebDavDataSource, xml: string) {
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
        path: remotePath,
        name: displayName || fallbackName,
        isDirectory,
      };
    })
    .filter((entry) => entry.href);
}

// -- Adapter --

function webdavAdapter(source: WebDavDataSource): RemoteBackendAdapter {
  return {
    cacheKeyPrefix: "webdav",
    sourceType: "webdav",
    normalizePath: (path) => normalizeRemotePath(path),
    downloadToCache: (remotePath, localName) => downloadToCache(source, remotePath, localName),
    buildCoverUri: (library, bookPath, hasCover) => buildCoverUri(library, source, bookPath, hasCover),
  };
}

// -- Public ops factory --

export function createWebDavOps(source: WebDavDataSource): RemoteLibraryOps {
  const adapter = webdavAdapter(source);
  return {
    testConnection: (timeout?: number) => testConnection(source, timeout),
    listDirectory: (path) => listDirectory(source, path),
    createLibraryFromPath: (remotePath) => createLibraryFromPath(adapter, source.id, source.name, remotePath),
    readBooks: (library) => readBooks(library, adapter),
    buildCoverUri: (library, bookPath, hasCover) => buildCoverUri(library, source, bookPath, hasCover),
    forceRefreshMetadata: (library) => sharedForceRefresh(library, adapter),
  };
}

// -- Standalone exports --

export async function testConnection(source: WebDavDataSource, timeout?: number | false): Promise<Response> {
  const response = await ky(buildUrl(source, ""), {
    method: "PROPFIND",
    timeout,
    throwHttpErrors: false,
    headers: {
      ...buildAuthHeader(source),
      Depth: "0",
    },
  });
  return response;
}

async function listDirectory(
  source: WebDavDataSource,
  path = "",
  timeout?: number | false
) {
  const response = await ky(buildUrl(source, path), {
    method: "PROPFIND",
    timeout,
    headers: {
      ...buildAuthHeader(source),
      Depth: "1",
      "Content-Type": "application/xml; charset=utf-8",
    },
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
  const response = await ky(buildUrl(source, remotePath), {
    headers: {
      ...buildAuthHeader(source),
    },
  });
  const bytes = new Uint8Array(await response.arrayBuffer());
  const file = new File(Paths.cache, localName);

  if (!file.exists) {
    file.create({ intermediates: true, overwrite: true });
  }

  file.write(bytes);
  return file;
}

export async function buildCoverUri(
  library: Library,
  source: WebDavDataSource,
  bookPath: string,
  hasCover: boolean,
): Promise<BookItem["coverUri"]> {
  if (!bookPath || !hasCover) {
    return undefined;
  }

  const remoteCoverPath = `${library.sourcePath ?? library.path}/${bookPath}/cover.jpg`;

  return {
    uri: buildUrl(source, remoteCoverPath),
    headers: buildAuthHeader(source),
  };
}