import { Directory, File } from "expo-file-system"
import ky from "ky"

import {
  canonicalRelativePath,
  canonicalRelativePathSegments,
  parentDirectoryUriForFileUri,
} from "../../fs/path"
import { WebDavUrlBuilder } from "../../webdav/url-builder"
import { NetworkError } from "../../../errors"
import i18n from "@/src/i18n"
import {
  getCachedAuth,
  setCachedAuth,
  invalidateCachedAuth,
} from "../auth-cache"

import type {
  RemoteBackend,
  RemoteFileStat,
  RemoteDirEntry,
  DownloadRequest,
  UploadRequest,
  PreparedUpload,
} from "../backend"
import type { DataSourceWebdav } from "@my-reader/tools/types/data-source"
type WebDavDataSource = DataSourceWebdav & { password: string }

function normalizeRemotePath(path: string) {
  const trimmed = path.trim()
  if (!trimmed || trimmed === "/") return ""
  return `/${trimmed.replace(/^\/+/, "").replace(/\/+$/, "")}`
}

function normalizeHrefPath(href: string) {
  const trimmed = href.trim()
  if (!trimmed) return ""
  let pathname = trimmed
  try {
    pathname = new URL(trimmed).pathname
  } catch {
    pathname = trimmed
  }
  const plain = canonicalRelativePath(pathname)
  return plain ? `/${plain}` : "/"
}

function extractTagValue(xml: string, tag: string) {
  const match = xml.match(
    new RegExp(`<[^>]*${tag}[^>]*>([\\s\\S]*?)</[^>]*${tag}>`, "i"),
  )
  return match?.[1]?.trim() ?? ""
}

function decodeXml(text: string) {
  return text
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
}

function toRemoteEntryPath(
  source: WebDavDataSource,
  href: string,
  isDirectory: boolean,
) {
  const normalizedPath = normalizeHrefPath(href).replace(
    /\/+$/,
    isDirectory ? "/" : "",
  )
  const basePath = normalizeRemotePath(source.rootPath ?? "")
  const expectedPrefix = `${basePath}/`.replace(/\/+/g, "/")

  if (!normalizedPath) return ""

  if (!basePath) {
    return normalizedPath === "/"
      ? ""
      : normalizedPath.replace(/\/+$/, isDirectory ? "/" : "")
  }

  if (normalizedPath === basePath || normalizedPath === `${basePath}/`)
    return ""

  if (normalizedPath.startsWith(expectedPrefix)) {
    const relativePath = normalizedPath.slice(basePath.length)
    return normalizeRemotePath(relativePath).replace(
      /\/+$/,
      isDirectory ? "/" : "",
    )
  }

  return normalizeRemotePath(normalizedPath).replace(
    /\/+$/,
    isDirectory ? "/" : "",
  )
}

function parsePropfind(source: WebDavDataSource, xml: string) {
  const responses =
    xml.match(/<[^>]*response[^>]*>[\s\S]*?<\/[^>]*response>/gi) ?? []
  return responses
    .map((chunk) => {
      const href = decodeXml(extractTagValue(chunk, "href"))
      const displayName = decodeXml(extractTagValue(chunk, "displayname"))
      const isDirectory = /<[^>]*collection\s*\/?>/i.test(chunk)
      const remotePath = toRemoteEntryPath(source, href, isDirectory)
      const fallbackName = remotePath.split("/").filter(Boolean).at(-1) ?? href
      return {
        href: remotePath,
        path: remotePath,
        name: displayName || fallbackName,
        isDirectory,
      }
    })
    .filter((entry) => entry.href)
}

export class WebDavRemoteBackend implements RemoteBackend {
  readonly kind = "webdav" as const
  readonly dataSourceId: string

  private readonly urlBuilder: WebDavUrlBuilder
  private readonly source: WebDavDataSource

  constructor(source: WebDavDataSource, libraryRootPath: string) {
    this.dataSourceId = source.id
    this.source = source
    this.urlBuilder = new WebDavUrlBuilder(source, libraryRootPath)
  }

  // -- Auth --

  async getAuthHeaders(): Promise<Record<string, string>> {
    const cached = getCachedAuth(this.dataSourceId)
    if (cached) return cached
    const headers = this.urlBuilder.authHeaders
    setCachedAuth(this.dataSourceId, headers, null)
    return headers
  }

  getCachedAuthHeaders(): Record<string, string> | null {
    return getCachedAuth(this.dataSourceId) ?? this.urlBuilder.authHeaders
  }

  invalidateAuth(): void {
    invalidateCachedAuth(this.dataSourceId)
  }

  // -- Stat --

  async statRemoteFile(remotePath: string): Promise<RemoteFileStat | null> {
    try {
      const response = await fetch(this.urlBuilder.urlFor(remotePath), {
        method: "PROPFIND",
        headers: { ...this.urlBuilder.authHeaders, Depth: "0" },
      })
      if (response.status === 404) return null
      if (!response.ok) {
        throw new NetworkError(
          i18n.t("sync.webdavPropfindFailed", {
            status: response.status,
            path: remotePath,
          }),
          response.status,
        )
      }
      const xml = await response.text()
      const size = Number(
        xml.match(/<[^>]*getcontentlength[^>]*>(\d+)</i)?.[1] ?? 0,
      )
      const lastModified = xml.match(
        /<[^>]*getlastmodified[^>]*>([^<]+)</i,
      )?.[1]
      const mtimeMs = lastModified ? new Date(lastModified).getTime() || 0 : 0
      const etag = `${mtimeMs}-${size}`
      return { etag, size, mtimeMs }
    } catch (e) {
      if (e instanceof NetworkError) throw e
      return null
    }
  }

  // -- Transfer --

  async readBytes(remotePath: string): Promise<Uint8Array> {
    const response = await fetch(this.urlBuilder.urlFor(remotePath), {
      method: "GET",
      headers: this.urlBuilder.authHeaders,
    })
    if (!response.ok) {
      throw new NetworkError(
        i18n.t("sync.webdavGetFailed", {
          status: response.status,
          path: remotePath,
        }),
        response.status,
      )
    }
    return new Uint8Array(await response.arrayBuffer())
  }

  async writeBytes(remotePath: string, bytes: Uint8Array): Promise<void> {
    await this.ensureParentDirectories(remotePath)
    const response = await fetch(this.urlBuilder.urlFor(remotePath), {
      method: "PUT",
      headers: {
        ...this.urlBuilder.authHeaders,
        "Content-Type": "application/octet-stream",
      },
      body: bytes as unknown as BodyInit,
    })
    if (!response.ok) {
      throw new NetworkError(
        i18n.t("sync.webdavPutFailed", {
          status: response.status,
          path: remotePath,
        }),
        response.status,
      )
    }
  }

  async deleteRemote(remotePath: string): Promise<void> {
    const response = await fetch(this.urlBuilder.urlFor(remotePath), {
      method: "DELETE",
      headers: this.urlBuilder.authHeaders,
    })
    if (!response.ok && response.status !== 404) {
      throw new NetworkError(
        i18n.t("sync.webdavDeleteFailed", {
          status: response.status,
          path: remotePath,
        }),
        response.status,
      )
    }
  }

  async listRemote(prefix: string): Promise<string[]> {
    const normalizedPrefix = prefix.endsWith("/") ? prefix : `${prefix}/`
    const url = this.urlBuilder.urlFor(normalizedPrefix)
    const response = await fetch(url, {
      method: "PROPFIND",
      headers: { ...this.urlBuilder.authHeaders, Depth: "1" },
    })
    if (response.status === 404) return []
    if (!response.ok) {
      throw new NetworkError(
        i18n.t("sync.webdavPropfindListFailed", {
          status: response.status,
          path: normalizedPrefix,
        }),
        response.status,
      )
    }
    const xml = await response.text()
    const requestPath = decodeURIComponent(
      url.replace(/^https?:\/\/[^/]+/, ""),
    ).replace(/\/?$/, "/")
    const children: string[] = []
    const hrefRegex = /<(?:[^>:]*:)?href>([^<]+)</gi
    let match: RegExpExecArray | null
    while ((match = hrefRegex.exec(xml)) !== null) {
      const hrefPath = decodeURIComponent(
        match[1]!.trim().replace(/^https?:\/\/[^/]+/, ""),
      )
      if (hrefPath.replace(/\/?$/, "/") === requestPath) continue
      const hrefWithSlash = hrefPath.endsWith("/") ? hrefPath : `${hrefPath}/`
      if (!hrefWithSlash.startsWith(requestPath)) continue
      const childRaw = hrefPath.slice(requestPath.length)
      const childName = hrefPath.endsWith("/")
        ? `${childRaw.replace(/\/$/, "")}/`
        : childRaw
      if (childName && !childName.replace(/\/$/, "").includes("/")) {
        children.push(childName)
      }
    }
    return children
  }

  async downloadToUri(remotePath: string, localFileUri: string): Promise<File> {
    const headers = await this.getAuthHeaders()
    const response = await ky(this.urlBuilder.urlFor(remotePath), {
      headers,
    })
    const bytes = new Uint8Array(await response.arrayBuffer())
    const parentUri = parentDirectoryUriForFileUri(localFileUri)
    if (parentUri) {
      const parent = new Directory(parentUri)
      if (!parent.exists) {
        parent.create({ idempotent: true, intermediates: true })
      }
    }
    const file = new File(localFileUri)
    if (file.exists) {
      file.delete()
    }
    file.create({ intermediates: true, overwrite: true })
    file.write(bytes)
    return file
  }

  async getDownloadRequest(
    remotePath: string,
    localFileUri: string,
  ): Promise<DownloadRequest> {
    const headers = await this.getAuthHeaders()
    return { remotePath, localFileUri, headers }
  }

  async getUploadRequest(
    localFileUri: string,
    remotePath: string,
  ): Promise<UploadRequest> {
    return {
      localFileUri,
      remotePath,
      headers: {
        ...this.urlBuilder.authHeaders,
        "Content-Type": "application/octet-stream",
      },
    }
  }

  async prepareUpload(
    localFileUri: string,
    remotePath: string,
  ): Promise<PreparedUpload> {
    await this.ensureParentDirectories(remotePath)
    return { id: `${Date.now()}`, remotePath, headers: {} }
  }

  // -- Path / URL --

  normalizePath(path: string): string {
    return normalizeRemotePath(path)
  }

  contentUrl(remotePath: string): string {
    return this.urlBuilder.urlFor(remotePath)
  }

  // -- Browse --

  async listDirectory(path: string): Promise<RemoteDirEntry[]> {
    const response = await ky(this.urlBuilder.urlFor(path), {
      method: "PROPFIND",
      headers: {
        ...this.urlBuilder.authHeaders,
        Depth: "1",
        "Content-Type": "application/xml; charset=utf-8",
      },
      body: `<?xml version="1.0" encoding="utf-8" ?><d:propfind xmlns:d="DAV:"><d:allprop /></d:propfind>`,
    })

    const xml = await response.text()
    const currentPath = normalizeRemotePath(path).replace(/\/+$/, "")

    return parsePropfind(this.source, xml)
      .filter((entry) => {
        const href = entry.href.replace(/\/+$/, "")
        return href !== currentPath
      })
      .sort((left, right) => {
        if (left.isDirectory !== right.isDirectory) {
          return left.isDirectory ? -1 : 1
        }
        return left.name.localeCompare(right.name, "zh-CN")
      })
  }

  // -- Private helpers --

  private async ensureParentDirectories(relativePath: string): Promise<void> {
    const parts = canonicalRelativePathSegments(relativePath)
    if (parts.length <= 1) return
    let cursor = ""
    for (let i = 0; i < parts.length - 1; i += 1) {
      cursor = cursor ? `${cursor}/${parts[i]}` : parts[i]!
      const response = await fetch(this.urlBuilder.urlFor(cursor), {
        method: "MKCOL",
        headers: this.urlBuilder.authHeaders,
      })
      if (!response.ok && ![201, 301, 405].includes(response.status)) {
        throw new NetworkError(
          i18n.t("sync.webdavMkcolFailed", {
            status: response.status,
            path: cursor,
          }),
          response.status,
        )
      }
    }
  }
}
